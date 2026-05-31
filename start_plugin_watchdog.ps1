param(
    [int]$Port = 8080,
    [int]$PollSeconds = 90,
    [int]$DisconnectThreshold = 3,
    [int]$RecoveryCooldownSeconds = 600,
    [int]$LaunchGraceSeconds = 90,
    [switch]$EnableRemNoteRestart,
    [switch]$EnableVersionSync,
    [switch]$EnableDisconnectSyncRecovery
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $root 'watch_remnote_plugin.ps1'

$argumentLine = @(
    '-NoProfile'
    '-WindowStyle Hidden'
    '-ExecutionPolicy Bypass'
    '-File'
    $scriptPath
    '-Port'
    "$Port"
    '-PollSeconds'
    "$PollSeconds"
    '-DisconnectThreshold'
    "$DisconnectThreshold"
    '-RecoveryCooldownSeconds'
    "$RecoveryCooldownSeconds"
    '-LaunchGraceSeconds'
    "$LaunchGraceSeconds"
)

if ($EnableRemNoteRestart) {
    $argumentLine += '-EnableRemNoteRestart'
}

if ($EnableVersionSync) {
    $argumentLine += '-EnableVersionSync'
}

if ($EnableDisconnectSyncRecovery) {
    $argumentLine += '-EnableDisconnectSyncRecovery'
}

Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
Start-Sleep -Seconds 2
$process = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -eq 'powershell.exe' -and
        $_.CommandLine -match 'watch_remnote_plugin\.ps1'
    } |
    Select-Object -First 1

[pscustomobject]@{
    ok = $true
    pid = if ($process) { $process.ProcessId } else { $null }
    port = $Port
    poll_seconds = $PollSeconds
    launch_grace_seconds = $LaunchGraceSeconds
    restart_enabled = [bool]$EnableRemNoteRestart
    version_sync_enabled = [bool]$EnableVersionSync
    disconnect_sync_enabled = [bool]$EnableDisconnectSyncRecovery
} | ConvertTo-Json -Depth 5
