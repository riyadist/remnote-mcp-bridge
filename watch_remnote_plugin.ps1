param(
    [int]$Port = 8080,
    [string]$HealthUrl = 'http://127.0.0.1:3400/health',
    [int]$PollSeconds = 90,
    [int]$DisconnectThreshold = 3,
    [int]$RecoveryCooldownSeconds = 600,
    [int]$LaunchGraceSeconds = 90,
    [string]$LogPath = "$PSScriptRoot\\watchdog.log",
    [int]$MaxIterations = 0,
    [switch]$EnableRemNoteRestart,
    [switch]$EnableVersionSync,
    [switch]$EnableDisconnectSyncRecovery
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$mutexName = 'Local\RemNoteMcpPluginWatchdog'
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$hasHandle = $false

try {
    $hasHandle = $mutex.WaitOne(0, $false)
    if (-not $hasHandle) {
        [pscustomobject]@{
            ok = $true
            started = $false
            reason = 'already_running'
        } | ConvertTo-Json -Depth 5
        exit 0
    }

    function Write-WatchdogLog {
        param(
            [string]$Message
        )

        $line = '{0} {1}' -f ([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')), $Message
        Add-Content -Path $LogPath -Value $line -Encoding UTF8
    }

    function Test-PluginManifest {
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

    function Get-RemNoteHealth {
        param(
            [string]$Url
        )

        try {
            return Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 5
        } catch {
            return $null
        }
    }

    function Get-ManifestVersion {
        param(
            [string]$Url
        )

        try {
            $manifest = Invoke-RestMethod -Uri $Url -TimeoutSec 5
            return '{0}.{1}.{2}' -f [int]$manifest.version.major, [int]$manifest.version.minor, [int]$manifest.version.patch
        } catch {
            return ''
        }
    }

    function Get-ActivePluginVersion {
        param(
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

    function Ensure-LocalPlugin {
        try {
            $raw = & "$PSScriptRoot\ensure_local_plugin.ps1" -Port $Port
            return $raw | ConvertFrom-Json
        } catch {
            throw "ensure_local_plugin failed: $($_.Exception.Message)"
        }
    }

    function Sync-PluginVersion {
        try {
            $raw = & "$PSScriptRoot\sync_remnote_dev_plugin.ps1" -ManifestUrl $manifestUrl -HostBaseUrl (($HealthUrl -replace '/health$','')) -EnsurePort $Port
            return $raw | ConvertFrom-Json
        } catch {
            throw "sync_remnote_dev_plugin failed: $($_.Exception.Message)"
        }
    }

    $manifestUrl = "http://127.0.0.1:$Port/manifest.json"
    $hostBaseUrl = ($HealthUrl -replace '/health$','')
    $disconnectCount = 0
    $lastRecoveryAt = [DateTime]::MinValue
    $iteration = 0
    $lastState = ''
    $lastVersionSyncAt = [DateTime]::MinValue
    $remnoteRunningSince = $null

    Write-WatchdogLog "watchdog_started port=$Port health=$HealthUrl"

    while ($true) {
        $iteration += 1
        $manifestOk = Test-PluginManifest -Url $manifestUrl
        if (-not $manifestOk) {
            try {
                $ensure = Ensure-LocalPlugin
                Write-WatchdogLog "manifest_recovered started=$($ensure.started) manifest=$($ensure.manifest)"
            } catch {
                Write-WatchdogLog "manifest_recovery_failed error=$($_.Exception.Message)"
            }
        }

        $health = Get-RemNoteHealth -Url $HealthUrl
        $remnoteRunning = @(Get-Process RemNote -ErrorAction SilentlyContinue).Count -gt 0

        if (-not $remnoteRunning) {
            $disconnectCount = 0
            $remnoteRunningSince = $null
            if ($lastState -ne 'remnote_not_running') {
                Write-WatchdogLog 'remnote_not_running'
                $lastState = 'remnote_not_running'
            }
        } else {
            if (-not $remnoteRunningSince) {
                $remnoteRunningSince = [DateTime]::UtcNow
            }
        }

        $withinLaunchGrace = $remnoteRunningSince -and (([DateTime]::UtcNow - $remnoteRunningSince.ToUniversalTime()).TotalSeconds -lt $LaunchGraceSeconds)

        if ($remnoteRunning -and $health -and $health.pluginConnected) {
            if ($disconnectCount -gt 0) {
                Write-WatchdogLog 'plugin_reconnected'
            }
            $disconnectCount = 0
            $lastState = 'plugin_connected'

            if ($EnableVersionSync -and -not $withinLaunchGrace) {
                $manifestVersion = Get-ManifestVersion -Url $manifestUrl
                $activeVersion = Get-ActivePluginVersion -BaseUrl $hostBaseUrl
                if ($manifestVersion -and $activeVersion -and $manifestVersion -ne $activeVersion) {
                    $syncElapsed = ([DateTime]::UtcNow - $lastVersionSyncAt.ToUniversalTime()).TotalSeconds
                    if ($syncElapsed -ge $RecoveryCooldownSeconds) {
                        try {
                            Write-WatchdogLog "plugin_version_mismatch manifest=$manifestVersion active=$activeVersion"
                            $sync = Sync-PluginVersion
                            Write-WatchdogLog "plugin_version_sync restarted=$($sync.restarted) synced=$($sync.synced) before=$($sync.activeVersionBefore) after=$($sync.activeVersionAfter)"
                        } catch {
                            Write-WatchdogLog "plugin_version_sync_failed error=$($_.Exception.Message)"
                        }
                        $lastVersionSyncAt = [DateTime]::UtcNow
                    }
                }
            }
        } elseif ($remnoteRunning) {
            if ($withinLaunchGrace) {
                $disconnectCount = 0
                if ($lastState -ne 'plugin_launch_grace') {
                    Write-WatchdogLog "plugin_launch_grace seconds=$LaunchGraceSeconds"
                    $lastState = 'plugin_launch_grace'
                }
            } else {
            $disconnectCount += 1
            if ($lastState -ne 'plugin_disconnected') {
                Write-WatchdogLog "plugin_disconnected count=$disconnectCount"
                $lastState = 'plugin_disconnected'
            }

            if ($disconnectCount -ge $DisconnectThreshold) {
                $elapsed = ([DateTime]::UtcNow - $lastRecoveryAt.ToUniversalTime()).TotalSeconds
                if ($elapsed -ge $RecoveryCooldownSeconds) {
                    try {
                        $ensure = Ensure-LocalPlugin
                        Write-WatchdogLog "disconnect_recovery_ensure started=$($ensure.started)"
                    } catch {
                        Write-WatchdogLog "disconnect_recovery_ensure_failed error=$($_.Exception.Message)"
                    }

                    if ($EnableDisconnectSyncRecovery) {
                        try {
                            $sync = Sync-PluginVersion
                            Write-WatchdogLog "disconnect_recovery_sync restarted=$($sync.restarted) synced=$($sync.synced) before=$($sync.activeVersionBefore) after=$($sync.activeVersionAfter)"
                        } catch {
                            Write-WatchdogLog "disconnect_recovery_sync_failed error=$($_.Exception.Message)"
                        }
                    }

                    if ($EnableRemNoteRestart -and $EnableDisconnectSyncRecovery) {
                        try {
                            Get-Process RemNote -ErrorAction SilentlyContinue | Stop-Process -Force
                            Start-Sleep -Seconds 2
                            Start-Process explorer.exe 'shell:AppsFolder\io.remnote'
                            Write-WatchdogLog 'remnote_restarted'
                        } catch {
                            Write-WatchdogLog "remnote_restart_failed error=$($_.Exception.Message)"
                        }
                    }

                    $lastRecoveryAt = [DateTime]::UtcNow
                    $disconnectCount = 0
                }
            }
            }
        }

        if ($MaxIterations -gt 0 -and $iteration -ge $MaxIterations) {
            break
        }

        Start-Sleep -Seconds $PollSeconds
    }

    [pscustomobject]@{
        ok = $true
        started = $true
        iterations = $iteration
        manifest = $manifestUrl
        log_path = $LogPath
    } | ConvertTo-Json -Depth 5
}
finally {
    if ($hasHandle) {
        $mutex.ReleaseMutex() | Out-Null
    }
    $mutex.Dispose()
}
