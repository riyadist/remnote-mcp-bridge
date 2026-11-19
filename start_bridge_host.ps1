param(
    [int]$HttpPort = 3400,
    [int]$WsPort = 3401
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stdoutLog = Join-Path $root 'bridge-host.stdout.log'
$stderrLog = Join-Path $root 'bridge-host.stderr.log'

function Set-DefaultEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, 'Process'))) {
        [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
    }
}

$httpExisting = Get-NetTCPConnection -LocalPort $HttpPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$wsExisting = Get-NetTCPConnection -LocalPort $WsPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($httpExisting -and $wsExisting) {
    Write-Output ([pscustomobject]@{
        started = $false
        alreadyListening = $true
        httpPort = $HttpPort
        wsPort = $WsPort
        pid = $httpExisting.OwningProcess
    } | ConvertTo-Json -Depth 5)
    exit 0
}

$env:REMNOTE_BRIDGE_HTTP_PORT = "$HttpPort"
$env:REMNOTE_BRIDGE_WS_PORT = "$WsPort"
Set-DefaultEnv -Name 'REMNOTE_TRANSLATE_CODEX_MODEL' -Value 'gpt-5.6-sol'
Set-DefaultEnv -Name 'REMNOTE_TRANSLATE_QUICK_CODEX_MODEL' -Value 'gpt-5.3-codex-spark'
Set-DefaultEnv -Name 'REMNOTE_TRANSLATE_TOPIC_CHAT_QUICK_MODEL' -Value 'gpt-5.3-codex-spark'
Set-DefaultEnv -Name 'REMNOTE_TRANSLATE_WARMUP' -Value '1'
Set-DefaultEnv -Name 'REMNOTE_CODEX_DISABLED_FEATURES' -Value 'plugins,remote_plugin,apps,browser_use,browser_use_external,computer_use,image_generation,in_app_browser,tool_search'
$process = Start-Process -FilePath 'node.exe' `
    -ArgumentList 'bridge-host.cjs' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

$maxWait = 10
$ready = $false
for ($i = 0; $i -lt $maxWait; $i++) {
    $httpListening = Get-NetTCPConnection -LocalPort $HttpPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    $wsListening = Get-NetTCPConnection -LocalPort $WsPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($httpListening -and $wsListening) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    throw "Bridge host baslatildi ama $HttpPort/$WsPort portlarinda dinlemiyor."
}

Write-Output ([pscustomobject]@{
    started = $true
    httpPort = $HttpPort
    wsPort = $WsPort
    pid = $process.Id
} | ConvertTo-Json -Depth 5)
