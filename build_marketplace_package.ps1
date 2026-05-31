param(
    [string]$OutputPath = "$PSScriptRoot\PluginZip_v2.58.0_marketplace.zip",
    [switch]$SkipTypeCheck,
    [switch]$SkipRestoreLocalBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $root 'public\manifest.json'
$marketplaceManifestPath = Join-Path $root 'public\manifest.marketplace.json'
$backupPath = Join-Path ([System.IO.Path]::GetTempPath()) ("remnote-marketplace-manifest-backup-{0}.json" -f ([guid]::NewGuid().ToString('N')))
$zipPath = Join-Path $root 'PluginZip.zip'
$marketplaceBuilt = $false
$result = $null

if (-not (Test-Path -LiteralPath $marketplaceManifestPath)) {
    throw "Marketplace manifest not found: $marketplaceManifestPath"
}

Push-Location $root
try {
    Copy-Item -LiteralPath $manifestPath -Destination $backupPath -Force
    Copy-Item -LiteralPath $marketplaceManifestPath -Destination $manifestPath -Force

    if (-not $SkipTypeCheck) {
        & npm run check-types
        if ($LASTEXITCODE -ne 0) {
            throw 'npm run check-types failed.'
        }
    }

    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw 'npm run build failed.'
    }

    Copy-Item -LiteralPath $zipPath -Destination $OutputPath -Force
    $marketplaceBuilt = $true

    $result = [pscustomobject]@{
        ok = $true
        outputPath = $OutputPath
        manifestId = 'remnote-mcp-bridge-y-edition'
        version = '2.58.0'
        localDevBuildRestored = $false
    }
} finally {
    if (Test-Path -LiteralPath $backupPath) {
        Copy-Item -LiteralPath $backupPath -Destination $manifestPath -Force
        Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
}

if ($marketplaceBuilt -and -not $SkipRestoreLocalBuild) {
    Push-Location $root
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw 'local dev npm run build failed after marketplace package.'
        }
        $result.localDevBuildRestored = $true
    } finally {
        Pop-Location
    }
}

$result | ConvertTo-Json -Depth 5
