param(
    [string]$SourcePath = "$PSScriptRoot\src\widgets\index.tsx",
    [string[]]$CoveragePaths = @(
        "$PSScriptRoot\test_bridge_actions.ps1",
        "$PSScriptRoot\test_flashcard_actions.ps1",
        "$PSScriptRoot\test_readonly_debug_actions.ps1",
        "$PSScriptRoot\update_and_test_semantic.ps1"
    ),
    [string]$OutputPath = '',
    [switch]$IncludeCovered,
    [switch]$FailOnUncovered
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-DispatchActions {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Source file not found: $Path"
    }

    $lines = Get-Content -LiteralPath $Path
    $switchStart = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match 'switch\s*\(\s*request\.action\s*\)') {
            $switchStart = $i + 1
            break
        }
    }

    if ($switchStart -eq 0) {
        throw "Could not find dispatch switch in $Path"
    }

    $defaultLine = 0
    for ($i = $switchStart; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*default\s*:') {
            $defaultLine = $i + 1
            break
        }
    }

    if ($defaultLine -eq 0) {
        throw "Could not find dispatch default case in $Path"
    }

    $actions = New-Object System.Collections.Generic.List[object]
    for ($i = $switchStart - 1; $i -lt $defaultLine - 1; $i++) {
        if ($lines[$i] -match '^\s*case\s+[''"]([^''"]+)[''"]\s*:') {
            $actions.Add([pscustomobject]@{
                action = $Matches[1]
                file = $Path
                line = $i + 1
            }) | Out-Null
        }
    }

    return [pscustomobject]@{
        switchStartLine = $switchStart
        defaultLine = $defaultLine
        actions = @($actions | Sort-Object action)
    }
}

function Get-CoverageReferences {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Paths
    )

    $references = @{}
    foreach ($path in $Paths) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Coverage file not found: $path"
        }

        $lineNo = 0
        foreach ($line in (Get-Content -LiteralPath $path)) {
            $lineNo += 1
            if ($line -match '-Action\s+[''"]([^''"]+)[''"]') {
                $action = $Matches[1]
                if (-not $references.ContainsKey($action)) {
                    $references[$action] = New-Object System.Collections.Generic.List[string]
                }
                $references[$action].Add(('{0}:{1}' -f $path, $lineNo)) | Out-Null
            }
        }
    }

    return $references
}

$dispatch = Get-DispatchActions -Path $SourcePath
$coverageRefs = Get-CoverageReferences -Paths $CoveragePaths

$rows = foreach ($entry in $dispatch.actions) {
    $covered = $coverageRefs.ContainsKey($entry.action)
    [pscustomobject]@{
        action = $entry.action
        actionLocation = ('{0}:{1}' -f $entry.file, $entry.line)
        covered = $covered
        coverageLocations = if ($covered) { [string[]]@($coverageRefs[$entry.action]) } else { $null }
    }
}

$uncovered = @($rows | Where-Object { -not $_.covered })
$coveredRows = @($rows | Where-Object { $_.covered })

$result = [ordered]@{
    generatedAt = (Get-Date).ToString('o')
    source = [ordered]@{
        path = $SourcePath
        switchStartLine = $dispatch.switchStartLine
        defaultLine = $dispatch.defaultLine
    }
    coverageFiles = @($CoveragePaths)
    summary = [ordered]@{
        actionCount = @($rows).Count
        coveredCount = $coveredRows.Count
        uncoveredCount = $uncovered.Count
    }
    uncovered = $uncovered
}

if ($IncludeCovered) {
    $result.covered = $coveredRows
}

$json = [pscustomobject]$result | ConvertTo-Json -Depth 8

if ($OutputPath) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)
}

$json

if ($FailOnUncovered -and $uncovered.Count -gt 0) {
    exit 1
}
