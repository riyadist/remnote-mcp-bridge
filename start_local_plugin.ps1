param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$distPath = Join-Path $root 'dist'
$stdoutLog = Join-Path $root 'static-server.stdout.log'
$stderrLog = Join-Path $root 'static-server.stderr.log'

if (-not (Test-Path $distPath)) {
    throw "dist klasoru bulunamadi. Once npm run build calistir."
}

function Get-OurStaticServerProcess {
    $matches = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $cmd = [string]$_.CommandLine
        $_.Name -eq 'node.exe' -and
        $cmd -like "*$root*" -and
        $cmd -like '*static-server.cjs*' -and
        $cmd -match "(^|\\s)$Port(\\s|$)"
    }

    return $matches | Select-Object -First 1
}

$existingProcess = Get-OurStaticServerProcess
if ($existingProcess) {
    Write-Output ([pscustomobject]@{
        started = $false
        port = $Port
        alreadyListening = $true
        pid = $existingProcess.ProcessId
        manifest = "http://127.0.0.1:$Port/manifest.json"
    } | ConvertTo-Json -Depth 5)
    exit 0
}

$process = Start-Process -FilePath 'node.exe' `
    -ArgumentList 'static-server.cjs', 'dist', $Port `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

Start-Sleep -Seconds 2

$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listening) {
    throw "Local plugin server baslatildi ama $Port portunda dinlemiyor. Windows bu portu reserve etmis olabilir."
}

Write-Output ([pscustomobject]@{
    started = $true
    port = $Port
    pid = $process.Id
    manifest = "http://127.0.0.1:$Port/manifest.json"
} | ConvertTo-Json -Depth 5)
