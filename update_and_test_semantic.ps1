param(
    [switch]$SkipTypeCheck,
    [switch]$SkipBuild,
    [switch]$SkipReload,
    [switch]$SkipSemanticRebuild,
    [switch]$AlsoDeep,
    [string]$SuitePath = "$PSScriptRoot\semantic_regression_suite.json",
    [int]$ManifestPort = 8080,
    [int]$BridgeHttpPort = 3400,
    [int]$BridgeWsPort = 3401,
    [int]$SemanticWaitSeconds = 120,
    [int]$SearchLimit = 5,
    [string[]]$Queries = @(
        'bilinc diyagrami',
        'global workspace theory',
        'hafiza sistemi',
        'retrieval memory workflow'
    ),
    [string]$OutputPath = "$PSScriptRoot\update_and_test_semantic_result.json"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$healthUrl = "http://127.0.0.1:$BridgeHttpPort/health"
$callUrl = "http://127.0.0.1:$BridgeHttpPort/call"

function Normalize-RegressionText {
    param(
        [string]$Value
    )

    $safeValue = if ($null -eq $Value) { '' } else { [string]$Value }

    $normalized = $safeValue.ToLowerInvariant().Normalize([System.Text.NormalizationForm]::FormC)
    $normalized = $normalized.Replace([string][char]0x00E7, 'c').Replace([string][char]0x00C7, 'c')
    $normalized = $normalized.Replace([string][char]0x011F, 'g').Replace([string][char]0x011E, 'g')
    $normalized = $normalized.Replace([string][char]0x0131, 'i').Replace([string][char]0x0130, 'i')
    $normalized = $normalized.Replace([string][char]0x00F6, 'o').Replace([string][char]0x00D6, 'o')
    $normalized = $normalized.Replace([string][char]0x015F, 's').Replace([string][char]0x015E, 's')
    $normalized = $normalized.Replace([string][char]0x00FC, 'u').Replace([string][char]0x00DC, 'u')
    return $normalized
}

function Test-TitleMatch {
    param(
        [string]$ActualTitle,
        [string]$ExpectedTitle
    )

    $actual = Normalize-RegressionText $ActualTitle
    $expected = Normalize-RegressionText $ExpectedTitle
    if ([string]::IsNullOrWhiteSpace($actual) -or [string]::IsNullOrWhiteSpace($expected)) {
        return $false
    }

    return $actual.Contains($expected) -or $expected.Contains($actual)
}

function Load-RegressionSuite {
    param(
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    return Get-Content -Path $Path -Raw | ConvertFrom-Json
}

function Get-OptionalPropertyValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,
        [Parameter(Mandatory = $true)]
        [string]$PropertyName,
        $DefaultValue = $null
    )

    if ($null -eq $InputObject) {
        return $DefaultValue
    }

    $property = $InputObject.PSObject.Properties[$PropertyName]
    if ($null -eq $property) {
        return $DefaultValue
    }

    return $property.Value
}

function Invoke-BridgeAction {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [hashtable]$Payload = @{},
        [int]$TimeoutSeconds = 60
    )

    $body = @{
        action = $Action
        payload = $Payload
    } | ConvertTo-Json -Depth 12

    $response = Invoke-RestMethod -Method Post -Uri $callUrl -ContentType 'application/json' -Body $body -TimeoutSec $TimeoutSeconds
    if (-not $response.ok) {
        throw "Bridge action failed: $Action"
    }

    return $response.result
}

function Wait-BridgeHealth {
    param(
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
            if ($health.ok) {
                return $health
            }
        } catch {
        }
        Start-Sleep -Milliseconds 800
    }

    throw "Bridge health endpoint hazir degil: $healthUrl"
}

function Wait-SemanticReady {
    param(
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastStatus = $null
    while ((Get-Date) -lt $deadline) {
        $lastStatus = Invoke-BridgeAction -Action 'semantic_status' -TimeoutSeconds 30
        if ($lastStatus.enabled -and -not $lastStatus.indexing) {
            return $lastStatus
        }
        Start-Sleep -Seconds 2
    }

    if ($lastStatus) {
        return $lastStatus
    }

    throw 'Semantic status okunamadi.'
}

function Run-SearchBatch {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$SearchQueries,
        [Parameter(Mandatory = $true)]
        [string]$Mode,
        [int]$Limit = 5
    )

    $rows = foreach ($query in $SearchQueries) {
        $searchResult = Invoke-BridgeAction -Action 'search' -Payload @{
            query = $query
            limit = $Limit
            searchMode = $Mode
        } -TimeoutSeconds 60

        [pscustomobject]@{
            query = $query
            mode = $Mode
            results = @(
                $searchResult.results |
                    Select-Object -First $Limit title, matchSource, resultType, semanticScore, duplicateCount
            )
        }
    }

    return @($rows)
}

function Invoke-RegressionSearchCase {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Case,
        [Parameter(Mandatory = $true)]
        [string]$Mode,
        [int]$FallbackLimit = 5
    )

    $caseLimit = Get-OptionalPropertyValue -InputObject $Case -PropertyName 'limit'
    $limit = if ($caseLimit) { [int]$caseLimit } else { $FallbackLimit }
    $caseId = Get-OptionalPropertyValue -InputObject $Case -PropertyName 'id' -DefaultValue ([string]$Case.query)
    $searchResult = Invoke-BridgeAction -Action 'search' -Payload @{
        query = [string]$Case.query
        limit = $limit
        searchMode = $Mode
    } -TimeoutSeconds 60

    return [pscustomobject]@{
        id = [string]$caseId
        query = [string]$Case.query
        mode = $Mode
        limit = $limit
        results = @(
            $searchResult.results |
                Select-Object -First $limit title, matchSource, resultType, semanticScore, duplicateCount
        )
    }
}

function Test-ExpectedInTop {
    param(
        [object[]]$Results,
        [string[]]$ExpectedAnyOf,
        [int]$TopN
    )

    if (-not $ExpectedAnyOf -or $ExpectedAnyOf.Count -eq 0) {
        return $null
    }

    $topResults = @($Results | Select-Object -First $TopN)
    foreach ($expected in $ExpectedAnyOf) {
        foreach ($item in $topResults) {
            if (Test-TitleMatch -ActualTitle ([string]$item.title) -ExpectedTitle $expected) {
                return $true
            }
        }
    }

    return $false
}

function Test-ForbiddenInTop {
    param(
        [object[]]$Results,
        [string[]]$ForbiddenAnyOf,
        [int]$TopN
    )

    if (-not $ForbiddenAnyOf -or $ForbiddenAnyOf.Count -eq 0) {
        return $null
    }

    $topResults = @($Results | Select-Object -First $TopN)
    foreach ($forbidden in $ForbiddenAnyOf) {
        foreach ($item in $topResults) {
            if (Test-TitleMatch -ActualTitle ([string]$item.title) -ExpectedTitle $forbidden) {
                return $false
            }
        }
    }

    return $true
}

function Evaluate-RegressionCase {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$RunResult,
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Case
    )

    $checks = @()
    $results = @($RunResult.results)
    $expectedTop1AnyOf = @(Get-OptionalPropertyValue -InputObject $Case -PropertyName 'expectedTop1AnyOf' -DefaultValue @())
    $expectedTop3AnyOf = @(Get-OptionalPropertyValue -InputObject $Case -PropertyName 'expectedTop3AnyOf' -DefaultValue @())
    $expectedTop5AnyOf = @(Get-OptionalPropertyValue -InputObject $Case -PropertyName 'expectedTop5AnyOf' -DefaultValue @())
    $forbiddenTop3AnyOf = @(Get-OptionalPropertyValue -InputObject $Case -PropertyName 'forbiddenTop3AnyOf' -DefaultValue @())
    $minTop1SemanticScore = Get-OptionalPropertyValue -InputObject $Case -PropertyName 'minTop1SemanticScore'
    $notes = Get-OptionalPropertyValue -InputObject $Case -PropertyName 'notes' -DefaultValue ''

    $top1 = Test-ExpectedInTop -Results $results -ExpectedAnyOf $expectedTop1AnyOf -TopN 1
    $top3 = Test-ExpectedInTop -Results $results -ExpectedAnyOf $expectedTop3AnyOf -TopN 3
    $top5 = Test-ExpectedInTop -Results $results -ExpectedAnyOf $expectedTop5AnyOf -TopN 5
    $forbiddenTop3 = Test-ForbiddenInTop -Results $results -ForbiddenAnyOf $forbiddenTop3AnyOf -TopN 3

    if ($null -ne $top1) {
        $checks += [pscustomobject]@{ name = 'expectedTop1AnyOf'; passed = [bool]$top1 }
    }
    if ($null -ne $top3) {
        $checks += [pscustomobject]@{ name = 'expectedTop3AnyOf'; passed = [bool]$top3 }
    }
    if ($null -ne $top5) {
        $checks += [pscustomobject]@{ name = 'expectedTop5AnyOf'; passed = [bool]$top5 }
    }
    if ($null -ne $forbiddenTop3) {
        $checks += [pscustomobject]@{ name = 'forbiddenTop3AnyOf'; passed = [bool]$forbiddenTop3 }
    }

    if ($minTop1SemanticScore -and $results.Count -gt 0) {
        $checks += [pscustomobject]@{
            name = 'minTop1SemanticScore'
            passed = ([double]$results[0].semanticScore -ge [double]$minTop1SemanticScore)
        }
    }

    $hasChecks = $checks.Count -gt 0
    $passed = if ($hasChecks) { -not ($checks | Where-Object { -not $_.passed }) } else { $null }

    return [pscustomobject]@{
        id = $RunResult.id
        query = $RunResult.query
        mode = $RunResult.mode
        passed = $passed
        checks = $checks
        results = $results
        notes = [string]$notes
    }
}

function Run-RegressionSuite {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Suite,
        [switch]$IncludeDeep,
        [int]$FallbackLimit = 5
    )

    $suiteResults = @()
    foreach ($case in @($Suite.cases)) {
        $modes = @(Get-OptionalPropertyValue -InputObject $case -PropertyName 'modes' -DefaultValue @())
        if ($modes.Count -eq 0) {
            $modes = @('normal')
        }

        foreach ($mode in $modes) {
            if ($mode -eq 'deep' -and -not $IncludeDeep) {
                continue
            }

            $runResult = Invoke-RegressionSearchCase -Case $case -Mode ([string]$mode) -FallbackLimit $FallbackLimit
            $suiteResults += Evaluate-RegressionCase -RunResult $runResult -Case $case
        }
    }

    $graded = @($suiteResults | Where-Object { $null -ne $_.passed })
    $suiteName = Get-OptionalPropertyValue -InputObject $Suite -PropertyName 'name' -DefaultValue 'Semantic Regression Suite'
    return [pscustomobject]@{
        name = [string]$suiteName
        path = $SuitePath
        total = $suiteResults.Count
        graded = $graded.Count
        passed = @($graded | Where-Object { $_.passed }).Count
        failed = @($graded | Where-Object { -not $_.passed }).Count
        cases = $suiteResults
    }
}

$result = [ordered]@{
    root = $root
    startedAt = (Get-Date).ToString('o')
    build = [ordered]@{
        typecheck = if ($SkipTypeCheck) { 'skipped' } else { 'pending' }
        bundle = if ($SkipBuild) { 'skipped' } else { 'pending' }
    }
    bridge = [ordered]@{
        healthBefore = $null
        healthAfter = $null
        statusBefore = $null
        statusAfter = $null
    }
    semantic = [ordered]@{
        statusBefore = $null
        rebuildRequested = (-not $SkipSemanticRebuild)
        statusAfter = $null
    }
    regression = $null
    tests = [ordered]@{
        normal = @()
        deep = @()
    }
}

try {
    & "$root\ensure_local_plugin.ps1" -Port $ManifestPort -BridgeHttpPort $BridgeHttpPort -BridgeWsPort $BridgeWsPort | Out-Null
    $result.bridge.healthBefore = Wait-BridgeHealth -TimeoutSeconds 30

    Push-Location $root
    try {
        if (-not $SkipTypeCheck) {
            & npm run check-types | Out-Host
            if ($LASTEXITCODE -ne 0) {
                throw 'npm run check-types basarisiz.'
            }
            $result.build.typecheck = 'passed'
        }

        if (-not $SkipBuild) {
            & npm run build | Out-Host
            if ($LASTEXITCODE -ne 0) {
                throw 'npm run build basarisiz.'
            }
            $result.build.bundle = 'passed'
        }
    } finally {
        Pop-Location
    }

    $result.bridge.statusBefore = Invoke-BridgeAction -Action 'get_status' -TimeoutSeconds 30

    if (-not $SkipReload) {
        Invoke-BridgeAction -Action 'reload_plugin' -TimeoutSeconds 30 | Out-Null
        Start-Sleep -Seconds 3
    }

    $result.bridge.healthAfter = Wait-BridgeHealth -TimeoutSeconds 30
    $result.bridge.statusAfter = Invoke-BridgeAction -Action 'get_status' -TimeoutSeconds 30

    $result.semantic.statusBefore = Invoke-BridgeAction -Action 'semantic_status' -TimeoutSeconds 30

    if (-not $SkipSemanticRebuild) {
        Invoke-BridgeAction -Action 'rebuild_semantic_index' -TimeoutSeconds 60 | Out-Null
    }

    $result.semantic.statusAfter = Wait-SemanticReady -TimeoutSeconds $SemanticWaitSeconds
    $suite = Load-RegressionSuite -Path $SuitePath
    if ($suite) {
        $result.regression = Run-RegressionSuite -Suite $suite -IncludeDeep:$AlsoDeep -FallbackLimit $SearchLimit
        $result.tests.normal = @($result.regression.cases | Where-Object { $_.mode -eq 'normal' } | Select-Object query, mode, results)
        $result.tests.deep = @($result.regression.cases | Where-Object { $_.mode -eq 'deep' } | Select-Object query, mode, results)
    } else {
        $result.tests.normal = Run-SearchBatch -SearchQueries $Queries -Mode 'normal' -Limit $SearchLimit

        if ($AlsoDeep) {
            $result.tests.deep = Run-SearchBatch -SearchQueries $Queries -Mode 'deep' -Limit $SearchLimit
        }
    }
}
finally {
    $result.completedAt = (Get-Date).ToString('o')
}

$json = [pscustomobject]$result | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($OutputPath, $json, (New-Object System.Text.UTF8Encoding($false)))
$json
