param(
    [int]$CdpPort = 9233,
    [int]$ManifestPort = 8080,
    [int]$BridgeHttpPort = 3400,
    [int]$BridgeWsPort = 3401,
    [ValidateRange(1,600)][int]$StartupWaitSeconds = 420,
    [switch]$AllowRestartRunningRemNote,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-LauncherStartupMutex {
    return (New-Object System.Threading.Mutex($false, 'Local\RemNoteAssistantLauncherStartup'))
}

function Test-PortListening {
    param([int]$Port)
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(200)) {
            return $false
        }
        return [bool]$client.Connected
    } catch {
        return $false
    } finally {
        if ($client) {
            $client.Close()
        }
    }
}

function Test-HttpReady {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 1
        return ($response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Start-StackWatcherIfMissing {
    $hostDir = (Resolve-Path (Join-Path $root '..\remnote_host')).Path
    $watcherScript = Join-Path $hostDir 'watch_remnote_stack.ps1'
    if (-not (Test-Path -LiteralPath $watcherScript)) {
        return [pscustomobject]@{
            ok = $false
            started = $false
            reason = 'watcher_script_missing'
            script = $watcherScript
        }
    }

    $existing = @(Get-CimInstance Win32_Process -Filter "name = 'powershell.exe'" | Where-Object {
        $_.CommandLine -like '*watch_remnote_stack.ps1*'
    })
    $guarded = @($existing | Where-Object { $_.CommandLine -match '(?i)(?:^|\s)-EnablePdfTranslateGuard(?:\s|$)' })
    if ($guarded.Count -gt 0) {
        return [pscustomobject]@{
            ok = $true
            started = $false
            reason = 'already_running'
            pid = [int]$guarded[0].ProcessId
            script = $watcherScript
        }
    }

    if ($existing.Count -gt 0) {
        return [pscustomobject]@{
            ok = $true
            started = $false
            reason = 'existing_watcher_preserved_guard_not_enabled'
            pid = [int]$existing[0].ProcessId
            script = $watcherScript
            guardEnabled = $false
        }
    }

    $argumentList = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watcherScript`" -LaunchGraceSeconds 1 -EnablePdfTranslateGuard"
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentList -WindowStyle Hidden -PassThru
    return [pscustomobject]@{
        ok = $true
        started = $true
        reason = 'started'
        pid = [int]$process.Id
        script = $watcherScript
    }
}

function Get-RemNoteExecutablePath {
    $processes = @(Get-Process RemNote -ErrorAction SilentlyContinue | Where-Object { $_.Path })
    if ($processes.Count -gt 0) {
        return [string]$processes[0].Path
    }

    $defaultPath = 'C:\Program Files\RemNote\RemNote.exe'
    if (Test-Path -LiteralPath $defaultPath) {
        return $defaultPath
    }

    throw 'Could not resolve RemNote executable path.'
}

function Start-RemNoteWithCdp {
    param([int]$Port)
    $remnoteExe = Get-RemNoteExecutablePath
    $running = @(Get-Process RemNote -ErrorAction SilentlyContinue)
    $hadRunningProcess = ($running.Count -gt 0)

    if ($running.Count -gt 0) {
        # The legacy compatibility flag never authorizes running-app restart.
        $focusSignalSent = $false
        try {
            $visibleProcess = $running | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
            if ($visibleProcess) {
                $shell = New-Object -ComObject WScript.Shell
                $focusSignalSent = [bool]$shell.AppActivate([int]$visibleProcess.Id)
            }
        } catch {
        }

        return [pscustomobject]@{
            started = $false
            restarted = $false
            skippedRestart = $true
            reason = 'remnote_running_without_cdp_no_restart'
            executable = $remnoteExe
            focusSignalSent = $focusSignalSent
            runningPids = @($running | Select-Object -ExpandProperty Id)
        }
    }

    Start-Process -FilePath $remnoteExe -ArgumentList "--remote-debugging-port=$Port" -WorkingDirectory (Split-Path $remnoteExe -Parent) | Out-Null
    return [pscustomobject]@{
        started = $true
        restarted = $hadRunningProcess
        skippedRestart = $false
        reason = 'started_with_cdp'
        executable = $remnoteExe
        focusSignalSent = $false
        runningPids = @()
    }
}

function Get-StartupStackMissing {
    $missing = @()
    $healthUrl = "http://127.0.0.1:$BridgeHttpPort/health"
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($health.ok -ne $true -or [int]$health.httpPort -ne $BridgeHttpPort -or [int]$health.wsPort -ne $BridgeWsPort) {
            $missing += $healthUrl
        }
    } catch { $missing += $healthUrl }
    $manifests = @(
        @{ Url = "http://127.0.0.1:$ManifestPort/manifest.json"; Id = 'remnote-mcp-bridge-y-edition-dev-2' },
        @{ Url = 'http://127.0.0.1:8083/manifest.json'; Id = 'mydrive-local-dev' },
        @{ Url = 'http://127.0.0.1:8084/manifest.json'; Id = 'remnote-todo-alarm-local-dev' },
        @{ Url = 'http://127.0.0.1:8085/manifest.json'; Id = 'rn-pdf-dark-local-dev' }
    )
    foreach ($entry in $manifests) {
        try {
            $manifest = Invoke-RestMethod -Uri $entry.Url -TimeoutSec 2
            if ([string]$manifest.id -ne $entry.Id -or [int]$manifest.manifestVersion -ne 1) {
                $missing += $entry.Url
            }
        } catch { $missing += $entry.Url }
    }
    $myDriveStatusUrl = 'http://127.0.0.1:8083/__mydrive_status'
    try {
        $status = Invoke-RestMethod -Uri $myDriveStatusUrl -TimeoutSec 2
        if (-not [bool]$status.ok) { $missing += $myDriveStatusUrl }
    } catch { $missing += $myDriveStatusUrl }
    return $missing
}

function Ensure-StartupStackReady {
    # Existing logon task owns service startup. Never race or restart it.
    # Stopwatch is monotonic: Windows clock adjustments cannot extend the wait.
    $clock = [Diagnostics.Stopwatch]::StartNew()
    try {
        do {
            $missing = @(Get-StartupStackMissing)
            if (-not $missing.Count) { break }
            if ($clock.Elapsed.TotalSeconds -ge $StartupWaitSeconds) {
                throw "startup_stack_not_ready timeoutSeconds=$StartupWaitSeconds missing=$($missing -join ',')"
            }
            Start-Sleep -Milliseconds 500
        } while ($true)
    } finally {
        $clock.Stop()
    }
    return [pscustomobject]@{
        ok = $true
        started = $false
        reason = 'startup_stack_ready'
        manifest = "http://127.0.0.1:$ManifestPort/manifest.json"
        bridgeHealth = "http://127.0.0.1:$BridgeHttpPort/health"
    }
}

# Transient serialization, not a new background process or startup task.
$launcherMutex = New-LauncherStartupMutex
$launcherAcquired = $false
try {
    $launcherWaitMs = ($StartupWaitSeconds + 60) * 1000
    try { $launcherAcquired = $launcherMutex.WaitOne($launcherWaitMs) }
    catch [System.Threading.AbandonedMutexException] { $launcherAcquired = $true }
    if (-not $launcherAcquired) { throw 'startup_launcher_busy' }

$restarted = $false
$launchState = $null
$pluginStartup = $null
$pluginStartupError = $null
try {
    $pluginStartup = Ensure-StartupStackReady
} catch {
    $pluginStartupError = $_.Exception.Message
    [pscustomobject]@{
        ok = $false
        reason = 'startup_stack_not_ready'
        cdpPort = $CdpPort
        cdpReady = $false
        restarted = $false
        pluginStartup = $pluginStartup
        pluginStartupError = $pluginStartupError
    } | ConvertTo-Json -Depth 5
    exit 1
}
if (-not (Test-PortListening -Port $CdpPort)) {
    if ($NoRestart) {
        [pscustomobject]@{
            ok = $false
            reason = 'cdp_port_not_listening'
            cdpPort = $CdpPort
            restarted = $false
        } | ConvertTo-Json -Depth 5
        exit 1
    }

    $launchState = Start-RemNoteWithCdp -Port $CdpPort
    $restarted = [bool]$launchState.restarted
    if ($launchState.skippedRestart) {
        [pscustomobject]@{
            ok = $true
            cdpPort = $CdpPort
            cdpReady = $false
            restarted = $false
            launch = $launchState
            pluginStartup = $pluginStartup
            pluginStartupError = $pluginStartupError
            injector = $null
        } | ConvertTo-Json -Depth 8
        exit 0
    }
}

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not (Test-PortListening -Port $CdpPort)) {
    Start-Sleep -Seconds 1
}

if (-not (Test-PortListening -Port $CdpPort)) {
    throw "RemNote CDP port did not open: $CdpPort"
}

$injectorScript = Join-Path $root 'start_remnote_cdp_toolbar_injector.ps1'
try {
    $injector = & $injectorScript `
        -CdpPort $CdpPort `
        -BridgeUrl "http://127.0.0.1:$BridgeHttpPort" `
        -PassThru
} catch {
    $injector = [pscustomobject]@{
        ok = $false
        started = $false
        reason = 'injector_start_failed'
        error = $_.Exception.Message
        cdpPort = $CdpPort
        bridgeUrl = "http://127.0.0.1:$BridgeHttpPort"
    }
}

try {
    $watcher = Start-StackWatcherIfMissing
} catch {
    $watcher = [pscustomobject]@{
        ok = $false
        started = $false
        reason = 'watcher_start_failed'
        error = $_.Exception.Message
    }
}

[pscustomobject]@{
    ok = [bool]($injector.ok -and $watcher.ok)
    cdpPort = $CdpPort
    cdpReady = $true
    restarted = $restarted
    launch = $launchState
    pluginStartup = $pluginStartup
    pluginStartupError = $pluginStartupError
    injector = $injector
    watcher = $watcher
} | ConvertTo-Json -Depth 8
} finally {
    if ($launcherAcquired) { $launcherMutex.ReleaseMutex() }
    $launcherMutex.Dispose()
}
