param(
    [string]$LogPath = "$PSScriptRoot\auto_builder.log"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command "npx" -ErrorAction SilentlyContinue)) {
    Write-Host "npx komutu bulunamadi. Git Bash veya Node.js kurulu olmalidir."
    exit 1
}

# npx -y nodemon ile ilgili dosyalardaki degisiklikleri izliyoruz
& npx -y nodemon --watch "src" --watch "bridge-host.cjs" -e "ts,tsx,css,cjs,js,json" --exec "powershell.exe -NoProfile -ExecutionPolicy Bypass -File update_remnote_bridge.ps1" *>> $LogPath

