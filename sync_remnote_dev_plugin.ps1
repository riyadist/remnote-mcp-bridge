param(
    [string]$ManifestUrl = 'http://127.0.0.1:8080/manifest.json',
    [string]$HostBaseUrl = 'http://127.0.0.1:3400',
    [int]$EnsurePort = 8080,
    [int]$WaitAfterRestartSeconds = 20,
    [int]$PollSeconds = 2,
    [switch]$ForceRestart
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$hostDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) "remnote_host"
$patchedRemNoteExe = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..\Temp')).Path 'RemNote_patched_runtime\RemNote.exe'
$allowPatchedRuntime = $env:REMNOTE_ALLOW_PATCHED_RUNTIME -eq '1'

function Get-ManifestVersionString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    $manifest = Invoke-RestMethod -Uri $Url -TimeoutSec 5
    if (-not $manifest.version) {
        throw "Manifest version missing: $Url"
    }

    return '{0}.{1}.{2}' -f `
        [int]$manifest.version.major, `
        [int]$manifest.version.minor, `
        [int]$manifest.version.patch
}

function Get-PluginStatusVersionString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl
    )

    $body = @{
        action = 'get_status'
        payload = @{}
    } | ConvertTo-Json -Depth 5

    $response = Invoke-RestMethod -Method Post -Uri ($BaseUrl.TrimEnd('/') + '/call') -ContentType 'application/json' -Body $body -TimeoutSec 10
    if (-not $response.ok -or -not $response.result.pluginVersion) {
        throw "Plugin status response missing pluginVersion from $BaseUrl"
    }

    return [string]$response.result.pluginVersion
}

function Wait-PluginVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedVersion,
        [int]$TimeoutSeconds = 30,
        [int]$SleepSeconds = 2
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $currentVersion = Get-PluginStatusVersionString -BaseUrl $BaseUrl
            if ($currentVersion -eq $ExpectedVersion) {
                return $true
            }
        } catch {
        }
        Start-Sleep -Seconds $SleepSeconds
    }

    return $false
}

function Get-RemNoteExecutablePath {
    if ($allowPatchedRuntime -and (Test-Path -LiteralPath $patchedRemNoteExe)) {
        return $patchedRemNoteExe
    }

    $processes = @(Get-Process RemNote -ErrorAction SilentlyContinue | Where-Object { $_.Path })
    if ($processes.Count -gt 0) {
        return [string]$processes[0].Path
    }

    $defaultPath = 'C:\Program Files\RemNote\RemNote.exe'
    if (Test-Path $defaultPath) {
        return $defaultPath
    }

    throw 'Could not resolve RemNote executable path.'
}

function Wait-RemNoteProcess {
    param(
        [int]$TimeoutSeconds = 20,
        [int]$SleepSeconds = 1
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $running = @(Get-Process RemNote -ErrorAction SilentlyContinue)
        if ($running.Count -gt 0) {
            return $true
        }
        Start-Sleep -Seconds $SleepSeconds
    }

    return $false
}

function Restart-RemNoteApp {
    $remnoteExe = Get-RemNoteExecutablePath
    $shortcutPath = 'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\RemNote.lnk'
    $vbsLauncher = Join-Path $PSScriptRoot 'launch_remnote.vbs'
    $running = @(Get-Process RemNote -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        $running | Stop-Process -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
    }

    $launchers = @(
        { if (Test-Path $shortcutPath) { Start-Process -FilePath $shortcutPath | Out-Null } },
        { if (Test-Path $vbsLauncher) { Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$vbsLauncher`"" | Out-Null } },
        { Start-Process -FilePath $remnoteExe -WorkingDirectory (Split-Path $remnoteExe -Parent) | Out-Null }
    )

    foreach ($launch in $launchers) {
        try {
            & $launch
        } catch {
        }

        if (Wait-RemNoteProcess -TimeoutSeconds 8 -SleepSeconds 1) {
            return $remnoteExe
        }
    }

    throw 'RemNote process did not start after restart attempts.'
}

& "$PSScriptRoot\ensure_local_plugin.ps1" -Port $EnsurePort | Out-Null

$manifestVersion = Get-ManifestVersionString -Url $ManifestUrl
$activeVersion = ''
try {
    $activeVersion = Get-PluginStatusVersionString -BaseUrl $HostBaseUrl
} catch {
    $activeVersion = ''
}

if (-not $ForceRestart -and $activeVersion -eq $manifestVersion) {
    [pscustomobject]@{
        ok = $true
        synced = $true
        restarted = $false
        manifestVersion = $manifestVersion
        activeVersion = $activeVersion
        forced = $false
    } | ConvertTo-Json -Depth 5
    exit 0
}

$exePath = Restart-RemNoteApp
Start-Sleep -Seconds 6
Start-Sleep -Seconds $WaitAfterRestartSeconds
$matched = Wait-PluginVersion -BaseUrl $HostBaseUrl -ExpectedVersion $manifestVersion -TimeoutSeconds $WaitAfterRestartSeconds -SleepSeconds $PollSeconds
$finalVersion = $null
try {
    $finalVersion = Get-PluginStatusVersionString -BaseUrl $HostBaseUrl
} catch {
    $finalVersion = ''
}

[pscustomobject]@{
    ok = $matched
    synced = $matched
    restarted = $true
    forced = [bool]$ForceRestart
    executable = $exePath
    manifestVersion = $manifestVersion
    activeVersionBefore = $activeVersion
    activeVersionAfter = $finalVersion
} | ConvertTo-Json -Depth 5

if (-not $matched) {
    exit 1
}
