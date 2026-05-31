param(
    [switch]$SkipBuild,
    [switch]$SkipTypeCheck,
    [int]$ManifestPort = 8080,
    [int]$BridgeHttpPort = 3400,
    [int]$BridgeWsPort = 3401,
    [string]$OutputPath = "$PSScriptRoot\last_update_result.json"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestUrl = "http://localhost:$ManifestPort/manifest.json"
$healthUrl = "http://127.0.0.1:$BridgeHttpPort/health"
$callUrl = "http://127.0.0.1:$BridgeHttpPort/call"

function Get-ExpectedPluginVersion {
    $package = Get-Content -Path (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
    return [string]$package.version
}

function Stop-BridgeProcesses {
    $targets = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
        $_.CommandLine -like '*static-server.cjs dist*' -or
        $_.CommandLine -like '*bridge-host.cjs*'
    }

    foreach ($target in $targets) {
        try {
            Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
        } catch {
        }
    }
}

function Wait-HttpJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            return Invoke-RestMethod -Uri $Url -TimeoutSec 5
        } catch {
            Start-Sleep -Milliseconds 800
        }
    }

    throw "HTTP endpoint hazir degil: $Url"
}

function Invoke-BridgeCall {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [hashtable]$Payload = @{}
    )

    $body = @{
        action = $Action
        payload = $Payload
    } | ConvertTo-Json -Depth 8

    return Invoke-RestMethod -Method Post -Uri $callUrl -ContentType 'application/json' -Body $body -TimeoutSec 30
}

$result = [ordered]@{
    root = $root
    expectedVersion = Get-ExpectedPluginVersion
    build = $null
    startup = $null
    manifest = $null
    health = $null
    status = $null
}

Push-Location $root
try {
    if (-not $SkipTypeCheck) {
        & npm run check-types | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw 'npm run check-types basarisiz.'
        }
    }

    if (-not $SkipBuild) {
        & npm run build | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw 'npm run build basarisiz.'
        }
        $result.build = 'completed'
    } else {
        $result.build = 'skipped'
    }
} finally {
    Pop-Location
}

Stop-BridgeProcesses
Start-Sleep -Seconds 1

$result.startup = (& "$root\ensure_local_plugin.ps1" -Port $ManifestPort -BridgeHttpPort $BridgeHttpPort -BridgeWsPort $BridgeWsPort | ConvertFrom-Json)
$result.manifest = Wait-HttpJson -Url $manifestUrl -TimeoutSeconds 20
$result.health = Wait-HttpJson -Url $healthUrl -TimeoutSeconds 20
$result.status = Invoke-BridgeCall -Action 'get_status'

$activeVersion = ''
if ($result.status.ok -and $result.status.result -and $result.status.result.pluginVersion) {
    $activeVersion = [string]$result.status.result.pluginVersion
}

$result.ok = ($result.health.ok -and $result.health.pluginConnected -and $activeVersion -eq $result.expectedVersion)
$result.activeVersion = $activeVersion

if ($result.health) {
    if (-not $result.health.runtime) {
        $result.health | Add-Member -NotePropertyName runtime -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    $result.health.runtime | Add-Member -NotePropertyName lastUpdate -NotePropertyValue ([pscustomobject]@{
        ok = $result.ok
        expectedVersion = $result.expectedVersion
        activeVersion = $activeVersion
        build = $result.build
    }) -Force
}

$json = [pscustomobject]$result | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)
$json

try {
    Invoke-BridgeCall -Action 'reload_plugin' -ErrorAction SilentlyContinue | Out-Null
    Write-Host "
>>> Plugin reload sinyali gonderildi.
"
} catch {}

if (-not $result.ok) {
    exit 1
}

try {
    Invoke-BridgeCall -Action 'reload_plugin' -ErrorAction SilentlyContinue | Out-Null
    Write-Host "Plugin reload sinyali gonderildi."
} catch {
}


