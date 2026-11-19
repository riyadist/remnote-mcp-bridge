param(
    [int]$Port = 8080,
    [int]$BridgeHttpPort = 3400,
    [int]$BridgeWsPort = 3401,
    [int]$WaitSeconds = 10
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestUrl = "http://127.0.0.1:$Port/manifest.json"
$bridgeHealthUrl = "http://127.0.0.1:$BridgeHttpPort/health"

function Test-PluginManifest {
    param(
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -ne 200) {
            return $false
        }
        $json = $response.Content | ConvertFrom-Json
        return (
            $json.manifestVersion -eq 1 -and
            $json.name -like 'MCP Bridge*' -and
            $json.author -eq 'Yavuz Uysal'
        )
    } catch {
        return $false
    }
}

function Test-BridgeHealth {
    param(
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

$manifestReady = Test-PluginManifest -Url $manifestUrl
$bridgeReady = Test-BridgeHealth -Url $bridgeHealthUrl

function Test-CdpPort {
    try {
        $connections = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 9233 -State Listen -ErrorAction SilentlyContinue)
        return $connections.Count -gt 0
    } catch {
        return $false
    }
}

function Start-CdpToolbarInjectorIfReady {
    if (Test-CdpPort) {
        try {
            & "$root\start_remnote_cdp_toolbar_injector.ps1" -CdpPort 9233 -BridgeUrl "http://127.0.0.1:$BridgeHttpPort" | Out-Null
        } catch {
        }
    }
}

if ($manifestReady -and $bridgeReady) {
    Start-CdpToolbarInjectorIfReady
    [pscustomobject]@{
        ok = $true
        started = $false
        reason = 'already_listening'
        manifest = $manifestUrl
        bridgeHealth = $bridgeHealthUrl
    } | ConvertTo-Json -Depth 5
    exit 0
}

$bridgeResult = $null
if (-not $bridgeReady) {
    $bridgeResult = & "$root\start_bridge_host.ps1" -HttpPort $BridgeHttpPort -WsPort $BridgeWsPort | ConvertFrom-Json
}

$startResult = $null
if (-not $manifestReady) {
    $startResult = & "$root\start_local_plugin.ps1" -Port $Port | ConvertFrom-Json
}

$ready = $false
for ($i = 0; $i -lt $WaitSeconds; $i++) {
    if ((Test-PluginManifest -Url $manifestUrl) -and (Test-BridgeHealth -Url $bridgeHealthUrl)) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    throw "Local RemNote plugin server acildi ama manifest hazir degil: $manifestUrl"
}

Start-CdpToolbarInjectorIfReady

$startPid = $null
if ($startResult -and $startResult.PSObject.Properties['pid'] -and $startResult.pid) {
    $startPid = $startResult.pid
}

$bridgePid = $null
if ($bridgeResult -and $bridgeResult.PSObject.Properties['pid'] -and $bridgeResult.pid) {
    $bridgePid = $bridgeResult.pid
}

[pscustomobject]@{
    ok = $true
    started = [bool](($startResult -and $startResult.started) -or ($bridgeResult -and $bridgeResult.started))
    manifest = $manifestUrl
    bridgeHealth = $bridgeHealthUrl
    pid = $startPid
    bridgePid = $bridgePid
} | ConvertTo-Json -Depth 5
