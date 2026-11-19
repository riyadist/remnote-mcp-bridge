param(
    [int]$CdpPort = 9233,
    [string]$BridgeUrl = 'http://127.0.0.1:3400',
    [int]$HeartbeatStaleSeconds = 15,
    [switch]$PassThru
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $root 'remnote-cdp-toolbar-injector.cjs'
$stdoutLog = Join-Path $root 'remnote-cdp-toolbar-injector.stdout.log'
$stderrLog = Join-Path $root 'remnote-cdp-toolbar-injector.stderr.log'
$statusDir = [System.IO.Path]::GetFullPath((Join-Path $root '..\..\Temp'))
$statusPath = Join-Path $statusDir 'remnote_cdp_toolbar_injector_status.json'

New-Item -ItemType Directory -Path $statusDir -Force | Out-Null

if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "CDP toolbar injector not found: $scriptPath"
}

$existing = @(Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
    $_.CommandLine -like '*remnote-cdp-toolbar-injector.cjs*'
})

if ($existing.Count -gt 0) {
    $heartbeat = $null
    $heartbeatError = $null
    try {
        $heartbeat = Get-Content -LiteralPath $statusPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch {
        $heartbeatError = $_.Exception.Message
    }

    $processIds = @($existing | ForEach-Object { [int]$_.ProcessId })
    $heartbeatAt = $null
    if ($heartbeat -and $heartbeat.updatedAt) {
        try { $heartbeatAt = [DateTime]::Parse([string]$heartbeat.updatedAt).ToUniversalTime() } catch {}
    }
    $heartbeatAgeSeconds = if ($heartbeatAt) {
        [Math]::Round(([DateTime]::UtcNow - $heartbeatAt).TotalSeconds, 1)
    } else {
        $null
    }
    $heartbeatFresh = [bool](
        $heartbeat -and
        $processIds -contains [int]$heartbeat.pid -and
        [int]$heartbeat.cdpPort -eq $CdpPort -and
        $heartbeatAt -and
        $heartbeatAgeSeconds -le $HeartbeatStaleSeconds
    )

    $heartbeatState = [string]$heartbeat.state
    $heartbeatReady = [bool](
        $heartbeatFresh -and
        [bool]$heartbeat.cdpReady -and
        [int]$heartbeat.successfulPages -gt 0 -and
        $heartbeatState -in @('healthy', 'polling', 'busy')
    )

    if ($heartbeatFresh) {
        $result = [pscustomobject]@{
            ok = $true
            ready = $heartbeatReady
            started = $false
            pid = [int]$heartbeat.pid
            reason = if ($heartbeatReady) { 'already_running_healthy' } else { 'already_running_waiting_for_page' }
            cdpPort = $CdpPort
            bridgeUrl = $BridgeUrl
            statusPath = $statusPath
            heartbeatAgeSeconds = $heartbeatAgeSeconds
            heartbeatState = $heartbeatState
            successfulPages = [int]$heartbeat.successfulPages
        }
        if ($PassThru) { return $result }
        $result | ConvertTo-Json -Depth 5
        exit 0
    }

    foreach ($process in $existing) {
        Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 250
    Remove-Item -LiteralPath $statusPath -Force -ErrorAction SilentlyContinue
}

$node = (Get-Command node -ErrorAction Stop).Source
$argumentList = @(
    "`"$scriptPath`"",
    "--cdp-port=$CdpPort",
    "--bridge-url=$BridgeUrl",
    "--status-file=`"$statusPath`""
)

$process = Start-Process `
    -FilePath $node `
    -ArgumentList $argumentList `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

$result = [pscustomobject]@{
    ok = $true
    ready = $false
    started = $true
    pid = [int]$process.Id
    cdpPort = $CdpPort
    bridgeUrl = $BridgeUrl
    statusPath = $statusPath
    replacedStaleProcesses = @($existing | ForEach-Object { [int]$_.ProcessId })
    stdoutLog = $stdoutLog
    stderrLog = $stderrLog
}

if ($PassThru) { return $result }
$result | ConvertTo-Json -Depth 5
