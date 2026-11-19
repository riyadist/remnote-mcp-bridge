param(
    [switch]$SkipBuild,
    [switch]$SkipTypeCheck,
    [int]$ManifestPort = 8080,
    [int]$BridgeHttpPort = 3400,
    [int]$BridgeWsPort = 3401,
    [int]$ReloadTimeoutSeconds = 25,
    [int]$ReloadPollMilliseconds = 800,
    [string]$OutputPath = "$PSScriptRoot\last_update_result.json"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestUrl = "http://localhost:$ManifestPort/manifest.json"
$healthUrl = "http://127.0.0.1:$BridgeHttpPort/health"
$callUrl = "http://127.0.0.1:$BridgeHttpPort/call"
$updateReceiptPath = Join-Path $root 'plugin_update_info.json'
$distPath = Join-Path $root 'dist'

function Get-VerifiedPluginUpdateRecord {
    param([string]$Path)
    $record = $null
    try {
        $candidate = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        $timestamp = [DateTimeOffset]::MinValue
        if ($candidate.verified -is [bool] -and $candidate.verified -eq $true -and
            $candidate.version -is [string] -and $candidate.version -match '^[0-9A-Za-z][0-9A-Za-z.+-]*$' -and
            $candidate.updatedAt -is [string] -and $candidate.updatedAt -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$' -and
            [DateTimeOffset]::TryParse($candidate.updatedAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$timestamp) -and
            $timestamp -le [DateTimeOffset]::UtcNow) {
            $record = [pscustomobject]@{version = $candidate.version; updatedAt = $candidate.updatedAt; verified = $true}
        }
    } catch {
        # Missing or invalid history is unknown, never inferred from file times.
    }
    return $record
}

function Write-PluginUpdateRecord {
    param([string]$Path, [object]$Record)
    $parent = Split-Path -Parent $Path
    [System.IO.Directory]::CreateDirectory($parent) | Out-Null
    $temporaryPath = Join-Path $parent ([System.IO.Path]::GetRandomFileName())
    try {
        $jsonRecord = $Record | ConvertTo-Json -Depth 3
        [System.IO.File]::WriteAllText($temporaryPath, $jsonRecord, (New-Object System.Text.UTF8Encoding($false)))
        if ([System.IO.File]::Exists($Path)) {
            [System.IO.File]::Replace($temporaryPath, $Path, [NullString]::Value)
        } else {
            [System.IO.File]::Move($temporaryPath, $Path)
        }
    } finally {
        if ([System.IO.File]::Exists($temporaryPath)) { [System.IO.File]::Delete($temporaryPath) }
    }
}

$previousUpdateRecord = Get-VerifiedPluginUpdateRecord -Path $updateReceiptPath
$publishedUpdateRecords = @()
if (Test-Path -LiteralPath $distPath) {
    foreach ($file in (Get-ChildItem -LiteralPath $distPath -Filter 'plugin-update-*.json' -File)) {
        $record = Get-VerifiedPluginUpdateRecord -Path $file.FullName
        if ($record -and $file.Name -ceq "plugin-update-$($record.version).json") { $publishedUpdateRecords += $record }
    }
}
if ($previousUpdateRecord) { $publishedUpdateRecords += $previousUpdateRecord }

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
        [hashtable]$Payload = @{},
        [int]$TimeoutSec = 30
    )

    $body = @{
        action = $Action
        payload = $Payload
    } | ConvertTo-Json -Depth 8

    return Invoke-RestMethod -Method Post -Uri $callUrl -ContentType 'application/json' -Body $body -TimeoutSec $TimeoutSec
}

$result = [ordered]@{
    root = $root
    expectedVersion = Get-ExpectedPluginVersion
    build = $null
    startup = $null
    manifest = $null
    health = $null
    status = $null
    reload = $null
}

# Restore prior records only after deployment/verification has finished. In
# particular, a completed build must not preload the prior same-version date.
try {
$preBuildActiveVersion = ''
try {
    $preBuildStatus = Invoke-BridgeCall -Action 'get_status' -TimeoutSec 5
    if ($preBuildStatus.ok -is [bool] -and $preBuildStatus.ok -eq $true -and
        $preBuildStatus.result.pluginVersion -is [string]) {
        $preBuildActiveVersion = $preBuildStatus.result.pluginVersion
    }
} catch {
    # An unavailable baseline cannot prove a new loaded-version transition.
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

$reloadSent = $false
$reloadVerified = $false
try {
    $reloadResponse = Invoke-BridgeCall -Action 'reload_plugin' -TimeoutSec 5 -ErrorAction Stop
    $reloadSent = $true
    $reloadVerified = ($reloadResponse.ok -is [bool] -and $reloadResponse.ok -eq $true -and
        $reloadResponse.result.ok -is [bool] -and $reloadResponse.result.ok -eq $true)
} catch {
}

$activeVersion = ''
$deadline = (Get-Date).AddSeconds($ReloadTimeoutSeconds)
while ((Get-Date) -lt $deadline) {
    try {
        $result.status = Invoke-BridgeCall -Action 'get_status'
        if ($result.status.ok -and $result.status.result -and $result.status.result.pluginVersion) {
            $activeVersion = [string]$result.status.result.pluginVersion
            if ($activeVersion -eq $result.expectedVersion) {
                break
            }
        }
    } catch {
    }

    Start-Sleep -Milliseconds $ReloadPollMilliseconds
}

if (-not $result.status) {
    $result.status = Invoke-BridgeCall -Action 'get_status'
    if ($result.status.ok -and $result.status.result -and $result.status.result.pluginVersion) {
        $activeVersion = [string]$result.status.result.pluginVersion
    }
}

$result.ok = ($result.health.ok -and $result.health.pluginConnected -and $activeVersion -eq $result.expectedVersion)
$result.activeVersion = $activeVersion
if ($result.ok -eq $true -and $result.startup.ok -eq $true -and $activeVersion -ceq $result.expectedVersion -and
    $result.expectedVersion -match '^[0-9A-Za-z][0-9A-Za-z.+-]*$') {
    $updateRecord = $null
    if ($result.build -eq 'completed' -and $reloadVerified -and
        $preBuildActiveVersion -ne '' -and $preBuildActiveVersion -cne $activeVersion) {
        # This is actual loaded-version verification completion, not reconnect time.
        $updateRecord = [pscustomobject]@{
            version = [string]$result.expectedVersion
            updatedAt = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
            verified = $true
        }
        Write-PluginUpdateRecord -Path $updateReceiptPath -Record $updateRecord
    } elseif ($previousUpdateRecord -and $previousUpdateRecord.version -ceq $activeVersion) {
        # Same-version rebuild has no unique bundle identity: preserve history.
        $updateRecord = $previousUpdateRecord
    }
    if ($updateRecord) {
        Write-PluginUpdateRecord -Path (Join-Path $distPath "plugin-update-$activeVersion.json") -Record $updateRecord
    }
}
$result.reload = [pscustomobject]@{
    sent = $reloadSent
    timeoutSeconds = $ReloadTimeoutSeconds
    pollMilliseconds = $ReloadPollMilliseconds
}

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

if (-not $result.ok) {
    exit 1
}
} finally {
    # npm build removes dist. On any failure restore prior verified records;
    # after success the new record already exists and must never be replaced.
    foreach ($record in $publishedUpdateRecords) {
        $recordPath = Join-Path $distPath "plugin-update-$($record.version).json"
        if (-not (Test-Path -LiteralPath $recordPath)) {
            Write-PluginUpdateRecord -Path $recordPath -Record $record
        }
    }
}

