param(
    [string]$HostBaseUrl = 'http://127.0.0.1:3400',
    [string]$ExpectedPluginVersion = '2.59.0',
    [string]$OutputPath = '',
    [int]$CaptureConsoleMs = 0,
    [switch]$CaptureScreenshot,
    [switch]$AllowNoBulletYActive,
    [switch]$RequireCdp
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$checks = @()
$startedAt = Get-Date

function Add-Check {
    param(
        [string]$Id,
        [string]$Severity,
        [bool]$Ok,
        [string]$Message,
        $Details = $null
    )

    $script:checks += [pscustomobject]@{
        id = $Id
        severity = $Severity
        ok = $Ok
        message = $Message
        details = $Details
    }
}

function Get-TempReportPath {
    param([string]$RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        return $RequestedPath
    }

    $tempPath = Join-Path $PSScriptRoot '..\..\Temp'
    $tempRoot = Resolve-Path -LiteralPath $tempPath -ErrorAction SilentlyContinue
    if (-not $tempRoot) {
        $tempRoot = New-Item -ItemType Directory -Force -Path $tempPath
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    return (Join-Path ([string]$tempRoot) "remnote-rontgen-verify-$stamp.json")
}

function Invoke-BridgeAction {
    param(
        [string]$Action,
        $Payload = @{}
    )

    $body = @{
        action = $Action
        payload = $Payload
    } | ConvertTo-Json -Depth 20

    $response = Invoke-RestMethod `
        -Method Post `
        -Uri ($HostBaseUrl.TrimEnd('/') + '/call') `
        -ContentType 'application/json' `
        -Body $body `
        -TimeoutSec 120

    if (-not $response.ok) {
        throw "$Action failed: $($response.error)"
    }

    return $response.result
}

function Get-Probe {
    param(
        $Snapshot,
        [string]$Name
    )

    return @($Snapshot.http | Where-Object { $_.name -eq $Name } | Select-Object -First 1)
}

function Get-VersionString {
    param($Version)

    if ($null -eq $Version) {
        return $null
    }

    if ($Version -is [string]) {
        return $Version
    }

    $major = $Version.major
    $minor = $Version.minor
    $patch = $Version.patch
    if ($null -eq $major -or $null -eq $minor -or $null -eq $patch) {
        return $null
    }

    return "$major.$minor.$patch"
}

function Get-Count {
    param($Value)

    if ($null -eq $Value) {
        return 0
    }

    return @($Value).Count
}

function Write-ReportAndExit {
    param(
        [string]$ReportPath,
        $Health,
        $Status,
        $Snapshot,
        [string]$FatalError = ''
    )

    $failed = @($script:checks | Where-Object { -not $_.ok -and $_.severity -ne 'info' })
    $fatalValue = $null
    if (-not [string]::IsNullOrWhiteSpace($FatalError)) {
        $fatalValue = $FatalError
    }

    $healthEvidence = $null
    if ($Health) {
        $healthEvidence = [pscustomobject]@{
            pluginConnected = $Health.pluginConnected
            connectedClients = $Health.connectedClients
            httpPort = $Health.httpPort
            wsPort = $Health.wsPort
        }
    }

    $statusEvidence = $null
    if ($Status) {
        $statusEvidence = [pscustomobject]@{
            connected = $Status.connected
            pluginVersion = $Status.pluginVersion
        }
    }

    $rontgenEvidence = $null
    if ($Snapshot) {
        $localManifest = Get-Probe -Snapshot $Snapshot -Name 'local_manifest'
        $localManifestVersion = $null
        if ($localManifest -and $localManifest.ok) {
            $localManifestVersion = Get-VersionString $localManifest.data.data.version
        }

        $screenshotPath = $null
        if ($Snapshot.screenshot -and $Snapshot.screenshot.ok) {
            $screenshotPath = $Snapshot.screenshot.data.path
        }

        $evidenceCdpData = if ($Snapshot.cdpTargets -and $Snapshot.cdpTargets.PSObject.Properties['data']) {
            $Snapshot.cdpTargets.data
        } else {
            $null
        }
        $evidenceDomData = if ($Snapshot.domSnapshot -and $Snapshot.domSnapshot.PSObject.Properties['data']) {
            $Snapshot.domSnapshot.data
        } else {
            $null
        }

        $rontgenEvidence = [pscustomobject]@{
            durationMs = $Snapshot.durationMs
            issueFlags = @($Snapshot.issueFlags)
            targetCount = if ($evidenceCdpData) { $evidenceCdpData.targetCount } else { 0 }
            remnotePageTargetCount = Get-Count $(if ($evidenceCdpData) { $evidenceCdpData.remnotePageTargets } else { $null })
            mcpPluginIframeTargetCount = Get-Count $(if ($evidenceCdpData) { $evidenceCdpData.pluginIframeTargets } else { $null })
            noBulletIframeTargetCount = Get-Count $(if ($evidenceCdpData) { $evidenceCdpData.noBulletIframeTargets } else { $null })
            domBodyElements = if ($evidenceDomData) { $evidenceDomData.counts.bodyElements } else { 0 }
            domVisibleElements = if ($evidenceDomData) { $evidenceDomData.counts.visibleElements } else { 0 }
            localManifestVersion = $localManifestVersion
            screenshotPath = $screenshotPath
        }
    }

    $elapsedMs = [int](((Get-Date) - $startedAt).TotalMilliseconds)
    $summaryOk = [bool]($failed.Count -eq 0 -and [string]::IsNullOrWhiteSpace($FatalError))
    $generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $checksArray = @($script:checks)
    $failedArray = @($failed)
    $evidence = [pscustomobject]@{
        health = $healthEvidence
        status = $statusEvidence
        rontgen = $rontgenEvidence
    }

    $summaryProperties = [ordered]@{}
    $summaryProperties['ok'] = $summaryOk
    $summaryProperties['generatedAt'] = $generatedAt
    $summaryProperties['durationMs'] = $elapsedMs
    $summaryProperties['hostBaseUrl'] = $HostBaseUrl
    $summaryProperties['expectedPluginVersion'] = $ExpectedPluginVersion
    $summaryProperties['outputPath'] = $ReportPath
    $summaryProperties['captureScreenshot'] = [bool]$CaptureScreenshot
    $summaryProperties['allowNoBulletYActive'] = [bool]$AllowNoBulletYActive
    $summaryProperties['requireCdp'] = [bool]$RequireCdp
    $summaryProperties['fatalError'] = $fatalValue
    $summaryProperties['checks'] = $checksArray
    $summaryProperties['failed'] = $failedArray
    $summaryProperties['evidence'] = $evidence
    $summary = [pscustomobject]$summaryProperties

    $parent = Split-Path -Parent $ReportPath
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText(
        $ReportPath,
        ($summary | ConvertTo-Json -Depth 40),
        $utf8NoBom
    )

    $summary | ConvertTo-Json -Depth 20

    if (-not $summary.ok) {
        $ids = @($failed | ForEach-Object { $_.id }) -join ', '
        if ([string]::IsNullOrWhiteSpace($ids)) {
            $ids = $FatalError
        }
        throw "RemNote rontgen verification failed: $ids"
    }
}

$OutputPath = Get-TempReportPath -RequestedPath $OutputPath
$health = $null
$status = $null
$snapshot = $null
$fatal = ''

try {
    $health = Invoke-RestMethod `
        -Method Get `
        -Uri ($HostBaseUrl.TrimEnd('/') + '/health') `
        -TimeoutSec 20

    Add-Check 'bridge_health_reachable' 'error' ($health.ok -eq $true) 'Bridge /health endpoint is reachable.' $health
    Add-Check 'bridge_health_plugin_connected' 'error' ($health.pluginConnected -eq $true) 'Bridge health reports pluginConnected=true.' @{
        pluginConnected = $health.pluginConnected
    }
} catch {
    Add-Check 'bridge_health_reachable' 'error' $false 'Bridge /health endpoint is not reachable.' $_.Exception.Message
}

try {
    $status = Invoke-BridgeAction -Action 'get_status'
    Add-Check 'get_status_action' 'error' ($null -ne $status) 'get_status action returned a result.' $status
    Add-Check 'get_status_connected' 'error' ($status.connected -eq $true) 'get_status reports connected=true.' @{
        connected = $status.connected
    }
    Add-Check 'get_status_version' 'error' ($status.pluginVersion -eq $ExpectedPluginVersion) 'Loaded plugin version matches the expected local bridge version.' @{
        actual = $status.pluginVersion
        expected = $ExpectedPluginVersion
    }
} catch {
    Add-Check 'get_status_action' 'error' $false 'get_status action failed.' $_.Exception.Message
}

try {
    $payload = @{
        includeDbInventory = $false
        includeSdkSurface = $false
        includeLogTails = $false
        captureConsoleMs = [Math]::Max(0, [Math]::Min(10000, $CaptureConsoleMs))
        captureScreenshot = [bool]$CaptureScreenshot
        cdpTimeoutMs = if ($CaptureScreenshot) { 30000 } else { 8000 }
        includeDbFiles = $false
    }

    $snapshot = Invoke-BridgeAction -Action 'host_remnote_rontgen_snapshot' -Payload $payload

    Add-Check 'rontgen_action' 'error' ($null -ne $snapshot) 'host_remnote_rontgen_snapshot returned a result.' $null
    Add-Check 'rontgen_mode' 'error' ($snapshot.mode -eq 'host_remnote_rontgen_snapshot') 'Rontgen snapshot mode is correct.' @{
        actual = $snapshot.mode
    }
    Add-Check 'rontgen_read_only' 'error' ($snapshot.readOnly -eq $true) 'Rontgen snapshot is read-only.' @{
        readOnly = $snapshot.readOnly
    }
    Add-Check 'rontgen_no_mutation' 'error' ($snapshot.mutationApplied -eq $false) 'Rontgen snapshot did not apply mutations.' @{
        mutationApplied = $snapshot.mutationApplied
    }
    Add-Check 'rontgen_bridge_plugin_connected' 'error' ($snapshot.bridgeHost.pluginConnected -eq $true) 'Rontgen sees the RemNote plugin connected.' @{
        pluginConnected = $snapshot.bridgeHost.pluginConnected
    }

    $localManifest = Get-Probe -Snapshot $snapshot -Name 'local_manifest'
    $localManifestVersion = if ($localManifest -and $localManifest.ok) { Get-VersionString $localManifest.data.data.version } else { $null }
    Add-Check 'local_manifest_reachable' 'error' ($localManifest -and $localManifest.ok) 'Local MCP Bridge manifest is reachable on port 8080.' $localManifest
    Add-Check 'local_manifest_version' 'error' ($localManifestVersion -eq $ExpectedPluginVersion) 'Local MCP Bridge manifest version matches expected version.' @{
        actual = $localManifestVersion
        expected = $ExpectedPluginVersion
    }

    $cdpAvailable = $null -ne $snapshot.cdpTargets -and $snapshot.cdpTargets.ok -eq $true
    $cdpData = if ($cdpAvailable) { $snapshot.cdpTargets.data } else { $null }
    $cdpSeverity = if ($RequireCdp) { 'error' } else { 'info' }
    Add-Check 'cdp_targets_reachable' $cdpSeverity $cdpAvailable 'RemNote CDP target list is reachable when debug diagnostics are explicitly required.' @{
        ok = if ($null -ne $snapshot.cdpTargets) { $snapshot.cdpTargets.ok } else { $false }
        targetCount = if ($null -ne $cdpData) { $cdpData.targetCount } else { 0 }
        required = [bool]$RequireCdp
    }
    Add-Check 'cdp_remnote_page_target' $cdpSeverity ((Get-Count $(if ($null -ne $cdpData) { $cdpData.remnotePageTargets } else { $null })) -gt 0) 'At least one RemNote page target is visible when CDP is required.' @{
        count = Get-Count $(if ($null -ne $cdpData) { $cdpData.remnotePageTargets } else { $null })
        required = [bool]$RequireCdp
    }
    Add-Check 'cdp_mcp_plugin_iframe_target' $cdpSeverity ((Get-Count $(if ($null -ne $cdpData) { $cdpData.pluginIframeTargets } else { $null })) -gt 0) 'MCP Bridge plugin iframe is visible when CDP is required.' @{
        count = Get-Count $(if ($null -ne $cdpData) { $cdpData.pluginIframeTargets } else { $null })
        required = [bool]$RequireCdp
    }

    $domAvailable = $null -ne $snapshot.domSnapshot -and $snapshot.domSnapshot.ok -eq $true
    $domData = if ($domAvailable) { $snapshot.domSnapshot.data } else { $null }
    Add-Check 'dom_snapshot' $cdpSeverity $domAvailable 'Live RemNote DOM snapshot is readable when CDP is required.' @{
        ok = if ($null -ne $snapshot.domSnapshot) { $snapshot.domSnapshot.ok } else { $false }
        readyState = if ($null -ne $domData) { $domData.readyState } else { $null }
        required = [bool]$RequireCdp
    }
    Add-Check 'dom_body_elements' $cdpSeverity ($null -ne $domData -and [int]$domData.counts.bodyElements -gt 0) 'Live RemNote DOM has body elements when CDP is required.' @{
        bodyElements = if ($null -ne $domData) { $domData.counts.bodyElements } else { 0 }
        visibleElements = if ($null -ne $domData) { $domData.counts.visibleElements } else { 0 }
        required = [bool]$RequireCdp
    }

    $activeBuildOverrides = @(
        $snapshot.hostFiles.buildOverrides |
            Where-Object {
                $_.summary.exists -eq $true -and
                (
                    [int]$_.summary.fileCount -gt 0 -or
                    [int]$_.summary.totalBytes -gt 0
                )
            }
    )
    $unsafeBuildOverrides = @(
        $activeBuildOverrides |
            Where-Object { $null -eq $_.classification -or $_.classification.stockSafe -ne $true }
    )
    Add-Check 'build_overrides_stock_safe' 'error' ($unsafeBuildOverrides.Count -eq 0) 'Active build_overrides directories are absent or recognized as complete stock updater bundles.' @{
        active = @($activeBuildOverrides | ForEach-Object { @{ path = $_.path; classification = $_.classification } })
        unsafe = @($unsafeBuildOverrides | ForEach-Object { $_.path })
    }

    $blockingIssueFlags = @(
        $snapshot.issueFlags |
            Where-Object { @('critical', 'error', 'high', 'medium') -contains $_.severity }
    )
    Add-Check 'no_blocking_issue_flags' 'error' ($blockingIssueFlags.Count -eq 0) 'Rontgen produced no critical/error/high/medium issue flags.' @{
        flags = @($blockingIssueFlags)
        allFlags = @($snapshot.issueFlags)
    }

    $noBulletIframeCount = Get-Count $(if ($null -ne $cdpData) { $cdpData.noBulletIframeTargets } else { $null })
    Add-Check 'no_bullet_iframe_inactive' 'error' ($AllowNoBulletYActive -or $noBulletIframeCount -eq 0) 'No Bullet Y iframe is not active unless explicitly allowed.' @{
        count = $noBulletIframeCount
        allowNoBulletYActive = [bool]$AllowNoBulletYActive
    }

    $noBulletManifest = Get-Probe -Snapshot $snapshot -Name 'no_bullet_local_manifest'
    Add-Check 'no_bullet_server_not_running' 'error' ($AllowNoBulletYActive -or -not ($noBulletManifest -and $noBulletManifest.ok)) 'No Bullet Y localhost server is not running unless explicitly allowed.' @{
        ok = if ($noBulletManifest) { $noBulletManifest.ok } else { $null }
        allowNoBulletYActive = [bool]$AllowNoBulletYActive
    }

    $noBulletProcessCount = @(
        $snapshot.processes.bridgeRelatedProcesses |
            Where-Object { $_.commandLine -match 'remnote-no-bullet-points-y-fork|serve_no_bullet_y_dist|8082' }
    ).Count
    Add-Check 'no_bullet_process_not_running' 'error' ($AllowNoBulletYActive -or $noBulletProcessCount -eq 0) 'No Bullet Y process is not running unless explicitly allowed.' @{
        count = $noBulletProcessCount
        allowNoBulletYActive = [bool]$AllowNoBulletYActive
    }

    if ($CaptureScreenshot) {
        $screenshotOk = $snapshot.screenshot -and $snapshot.screenshot.ok -and
            (Test-Path -LiteralPath $snapshot.screenshot.data.path) -and
            ([int64]$snapshot.screenshot.data.bytes -gt 10000)

        Add-Check 'screenshot_capture' 'error' $screenshotOk 'Rontgen screenshot was captured and is non-empty.' @{
            path = if ($snapshot.screenshot -and $snapshot.screenshot.ok) { $snapshot.screenshot.data.path } else { $null }
            bytes = if ($snapshot.screenshot -and $snapshot.screenshot.ok) { $snapshot.screenshot.data.bytes } else { $null }
        }
    }
} catch {
    $fatal = $_.Exception.Message
    Add-Check 'rontgen_action' 'error' $false 'host_remnote_rontgen_snapshot failed.' $fatal
}

Write-ReportAndExit -ReportPath $OutputPath -Health $health -Status $status -Snapshot $snapshot -FatalError $fatal
