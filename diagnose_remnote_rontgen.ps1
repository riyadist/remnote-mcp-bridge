param(
    [string]$HostBaseUrl = 'http://127.0.0.1:3400',
    [string]$OutputPath = '',
    [int]$CaptureConsoleMs = 750,
    [switch]$CaptureScreenshot,
    [switch]$SkipDbInventory,
    [switch]$SkipSdkSurface,
    [switch]$SkipLogTails
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $tempRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\Temp') -ErrorAction SilentlyContinue
    if (-not $tempRoot) {
        $tempRoot = New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot '..\..\Temp')
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path ([string]$tempRoot) "remnote-rontgen-$stamp.json"
}

$payload = @{
    includeDbInventory = -not [bool]$SkipDbInventory
    includeSdkSurface = -not [bool]$SkipSdkSurface
    includeLogTails = -not [bool]$SkipLogTails
    captureConsoleMs = [Math]::Max(0, [Math]::Min(10000, $CaptureConsoleMs))
    captureScreenshot = [bool]$CaptureScreenshot
    cdpTimeoutMs = if ($CaptureScreenshot) { 30000 } else { 5000 }
    includeDbFiles = $false
}

$body = @{
    action = 'host_remnote_rontgen_snapshot'
    payload = $payload
} | ConvertTo-Json -Depth 12

$response = Invoke-RestMethod `
    -Method Post `
    -Uri ($HostBaseUrl.TrimEnd('/') + '/call') `
    -ContentType 'application/json' `
    -Body $body `
    -TimeoutSec 90

if (-not $response.ok) {
    throw "Rontgen action failed: $($response.error)"
}

$json = $response.result | ConvertTo-Json -Depth 40
$parent = Split-Path -Parent $OutputPath
if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $json, $utf8NoBom)

[pscustomobject]@{
    ok = $true
    outputPath = $OutputPath
    durationMs = $response.result.durationMs
    issueCount = @($response.result.issueFlags).Count
    issueFlags = $response.result.issueFlags
    screenshotPath = if ($response.result.screenshot -and $response.result.screenshot.ok) { $response.result.screenshot.data.path } else { $null }
} | ConvertTo-Json -Depth 8
