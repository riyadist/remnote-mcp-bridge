param(
    [int]$Port = 8080,
    [int]$BridgeHttpPort = 3400,
    [int]$BridgeWsPort = 3401,
    [int]$WaitForRemNoteSeconds = 30,
    [int]$CheckIntervalSeconds = 5,
    [string]$LogPath = "$PSScriptRoot\\startup-bootstrap.log",
    [switch]$EnableAutoRemNoteRestart
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-BootstrapLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $line = '{0} {1}' -f ([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')), $Message
    try {
        Add-Content -Path $LogPath -Value $line -Encoding UTF8
    } catch {
        # Best-effort logging: avoid breaking startup flow on transient file locks.
    }
}

function Test-PluginConnected {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HealthUrl
    )

    try {
        $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
        return [bool]$health.pluginConnected
    } catch {
        return $false
    }
}

function Get-ManifestVersionString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    try {
        $manifest = Invoke-RestMethod -Uri $Url -TimeoutSec 5
        if ($manifest.version) {
            return '{0}.{1}.{2}' -f [int]$manifest.version.major, [int]$manifest.version.minor, [int]$manifest.version.patch
        }
    } catch {
    }

    return ''
}

function Get-PluginStatusVersionString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl
    )

    try {
        $body = @{
            action = 'get_status'
            payload = @{}
        } | ConvertTo-Json -Depth 5
        $response = Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + '/call') -ContentType 'application/json' -Body $body -TimeoutSec 5
        if ($response.ok -and $response.result.pluginVersion) {
            return [string]$response.result.pluginVersion
        }
    } catch {
    }

    return ''
}

function Wait-ForRemNote {
    param(
        [int]$TimeoutSeconds,
        [int]$SleepSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (@(Get-Process RemNote -ErrorAction SilentlyContinue).Count -gt 0) {
            return $true
        }
        Start-Sleep -Seconds $SleepSeconds
    }

    return $false
}

$healthUrl = "http://127.0.0.1:$BridgeHttpPort/health"
$manifestUrl = "http://127.0.0.1:$Port/manifest.json"
$hostBaseUrl = "http://127.0.0.1:$BridgeHttpPort"

Write-BootstrapLog "bootstrap_started port=$Port bridge=$BridgeHttpPort/$BridgeWsPort"

try {
    $ensureRaw = & "$PSScriptRoot\ensure_local_plugin.ps1" -Port $Port -BridgeHttpPort $BridgeHttpPort -BridgeWsPort $BridgeWsPort
    Write-BootstrapLog "ensure_local_plugin=$($ensureRaw -join '')"
} catch {
    Write-BootstrapLog "ensure_local_plugin_failed error=$($_.Exception.Message)"
    throw
}

try {
    $watchRaw = & "$PSScriptRoot\start_plugin_watchdog.ps1" `
        -Port $Port `
        -PollSeconds 90 `
        -DisconnectThreshold 3 `
        -RecoveryCooldownSeconds 600 `
        -LaunchGraceSeconds 120
    Write-BootstrapLog "start_plugin_watchdog=$($watchRaw -join '')"
} catch {
    Write-BootstrapLog "start_plugin_watchdog_failed error=$($_.Exception.Message)"
}

$remnoteSeen = Wait-ForRemNote -TimeoutSeconds $WaitForRemNoteSeconds -SleepSeconds $CheckIntervalSeconds
Write-BootstrapLog "remnote_seen=$remnoteSeen"

if ($remnoteSeen) {
    $pluginConnected = Test-PluginConnected -HealthUrl $healthUrl
    $manifestVersion = Get-ManifestVersionString -Url $manifestUrl
    $activeVersion = Get-PluginStatusVersionString -BaseUrl $hostBaseUrl
    $needsSync = (-not $pluginConnected) -or ($manifestVersion -and $activeVersion -and $manifestVersion -ne $activeVersion)

    Write-BootstrapLog "startup_state plugin_connected=$pluginConnected manifest_version=$manifestVersion active_version=$activeVersion needs_sync=$needsSync"

    if ($needsSync) {
        Write-BootstrapLog 'startup_sync_starting'
        try {
            $syncRaw = & "$PSScriptRoot\sync_remnote_dev_plugin.ps1" `
                -ManifestUrl $manifestUrl `
                -HostBaseUrl $hostBaseUrl `
                -EnsurePort $Port `
                -WaitAfterRestartSeconds 20 `
                -PollSeconds 2 `
                -ForceRestart
            Write-BootstrapLog "startup_sync_done result=$($syncRaw -join '')"
        } catch {
            Write-BootstrapLog "startup_sync_failed error=$($_.Exception.Message)"
        }
    }
}

[pscustomobject]@{
    ok = $true
    remnote_seen = $remnoteSeen
    plugin_connected = (Test-PluginConnected -HealthUrl $healthUrl)
    auto_restart_enabled = [bool]$EnableAutoRemNoteRestart
    manifest = $manifestUrl
    health = $healthUrl
    log_path = $LogPath
} | ConvertTo-Json -Depth 5
