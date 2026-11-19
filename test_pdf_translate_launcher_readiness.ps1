# PowerShell 5.1. Only isolated fixture PowerShell children run.
# No real app, service, task, helper or network boundary is executed.
param([string]$FixtureCase = '')
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start_remnote_pdf_translate.ps1'

if ($FixtureCase) {
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($launcher, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw ($errors | Out-String) }
    foreach ($definition in $ast.EndBlock.Statements) {
        if ($definition -is [System.Management.Automation.Language.FunctionDefinitionAst]) {
            . ([scriptblock]::Create($definition.Extent.Text))
        }
    }
    # Execute real, unchanged top-level statements through startup/readiness.
    # Stop before the injector/watcher boundary, not a rewritten production copy.
    $begin = $ast.Find({ param($node)
        $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
        $node.Left.Extent.Text -eq '$restarted'
    }, $true)
    $end = $ast.Find({ param($node)
        $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
        $node.Left.Extent.Text -eq '$injectorScript'
    }, $true)
    if (-not $begin -or -not $end) { throw 'Production top-level boundaries missing' }
    $source = Get-Content -LiteralPath $launcher -Raw
    $body = $source.Substring($begin.Extent.StartOffset, $end.Extent.StartOffset - $begin.Extent.StartOffset)

    $root = $PSScriptRoot
    $CdpPort = 9233
    $ManifestPort = 8080
    $BridgeHttpPort = 3400
    $BridgeWsPort = 3401
    $StartupWaitSeconds = 1
    $AllowRestartRunningRemNote = ($FixtureCase -eq 'running-legacy')
    $NoRestart = ($FixtureCase -eq 'no-restart')
    $script:servicesReady = $FixtureCase -notin @('cold-stack', 'stack-failed')
    $script:healthProbes = 0
    $script:cdpReady = ($FixtureCase -eq 'cdp-ready')
    $script:running = ($FixtureCase -eq 'running-legacy')
    $script:launches = 0
    $script:stops = 0
    $script:focuses = 0
    $script:stackCalls = 0
    $script:coreEnsureCalls = 0
    $script:checked = @()
    $script:events = @()
    $script:fixtureError = ''
    $script:required = @(
        'http://127.0.0.1:3400/health',
        'http://127.0.0.1:8080/manifest.json',
        'http://127.0.0.1:8083/__mydrive_status',
        'http://127.0.0.1:8083/manifest.json',
        'http://127.0.0.1:8084/manifest.json',
        'http://127.0.0.1:8085/manifest.json'
    )

    function Test-PortListening { param([int]$Port) return $script:cdpReady }
    function Test-Path { param($LiteralPath, $Path) return $true }
    function Invoke-WebRequest {
        param($Uri, $TimeoutSec, [switch]$UseBasicParsing)
        $script:events += "http:$Uri"
        if (-not $script:servicesReady) { throw 'fixture endpoint unavailable' }
        $script:checked += [string]$Uri
        return [pscustomobject]@{ StatusCode = 200 }
    }
    function Invoke-RestMethod {
        param($Uri, $TimeoutSec, $Method)
        $script:events += "http:$Uri"
        if ($Uri -eq 'http://127.0.0.1:3400/health') {
            $script:healthProbes++
            if ($FixtureCase -eq 'cold-stack' -and $script:healthProbes -ge 3) {
                $script:servicesReady = $true
            }
        }
        if (-not $script:servicesReady) { throw 'fixture endpoint unavailable' }
        if ($Uri -eq 'http://127.0.0.1:3400/health') {
            $script:checked += [string]$Uri
            return [pscustomobject]@{ ok = $true; httpPort = 3400; wsPort = 3401 }
        }
        if ($FixtureCase -in @('missing-manifest', 'core-ready-other-missing') -and $Uri -eq 'http://127.0.0.1:8085/manifest.json') {
            throw 'fixture missing manifest'
        }
        if ($Uri -eq 'http://127.0.0.1:8083/__mydrive_status') {
            $script:checked += [string]$Uri
            return [pscustomobject]@{ ok = $true }
        }
        $ids = @{
            'http://127.0.0.1:8080/manifest.json' = 'remnote-mcp-bridge-y-edition-dev-2'
            'http://127.0.0.1:8083/manifest.json' = 'mydrive-local-dev'
            'http://127.0.0.1:8084/manifest.json' = 'remnote-todo-alarm-local-dev'
            'http://127.0.0.1:8085/manifest.json' = 'rn-pdf-dark-local-dev'
        }
        if (-not $ids.ContainsKey([string]$Uri)) { throw "Unexpected HTTP boundary: $Uri" }
        if ($FixtureCase -eq 'wrong-id' -and $Uri -eq 'http://127.0.0.1:8083/manifest.json') {
            return [pscustomobject]@{ id = 'foreign-plugin'; manifestVersion = 1 }
        }
        $script:checked += [string]$Uri
        return [pscustomobject]@{ id = $ids[[string]$Uri]; manifestVersion = 1 }
    }
    function powershell.exe {
        $script:stackCalls++
        throw "Forbidden child service starter: $($args -join ' ')"
    }
    function Get-Process {
        param($Name, $ErrorAction)
        if ($script:running) {
            $process = [pscustomobject]@{ Id = 101; Path = 'C:\fixture\RemNote.exe'; MainWindowHandle = 1 }
            $process | Add-Member -MemberType ScriptMethod -Name CloseMainWindow -Value {
                $script:stops++
                $script:running = $false
                return $true
            }
            return $process
        }
    }
    function Stop-Process {
        param($Id, [switch]$Force, $ErrorAction)
        $script:stops++
        $script:running = $false
    }
    function New-Object {
        param($ComObject)
        if ($ComObject -ne 'WScript.Shell') { throw 'Unexpected object boundary' }
        $shell = [pscustomobject]@{}
        $shell | Add-Member -MemberType ScriptMethod -Name AppActivate -Value {
            param($Id)
            $script:focuses++
            return $true
        }
        return $shell
    }
    function Start-Process {
        param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru)
        $script:launches++
        $script:events += 'app'
        if ([IO.Path]::GetFileName([string]$FilePath) -ne 'RemNote.exe') {
            throw 'Forbidden non-app process boundary'
        }
        if ($ArgumentList -ne '--remote-debugging-port=9233') { throw 'Unexpected app flags' }
        foreach ($url in $script:required) {
            if ($script:checked -notcontains $url) { throw "App launched before readiness: $url" }
        }
        $script:cdpReady = $true
    }
    function Start-Sleep {
        param($Milliseconds, $Seconds)
        [Threading.Thread]::Sleep(20)
    }

    $fixtureExit = 0
    try {
        & ([scriptblock]::Create($body))
    } catch {
        $script:fixtureError = $_.Exception.Message
        $fixtureExit = 1
    } finally {
        $report = [pscustomobject]@{
            case = $FixtureCase
            launches = $script:launches
            stops = $script:stops
            focuses = $script:focuses
            stackCalls = $script:stackCalls
            coreEnsureCalls = $script:coreEnsureCalls
            healthProbes = $script:healthProbes
            checked = @($script:checked)
            events = @($script:events)
            error = $script:fixtureError
            runtimeTouched = $false
        }
        Write-Output ('FIXTURE ' + ($report | ConvertTo-Json -Depth 5 -Compress))
    }
    exit $fixtureExit
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ($Actual -ne $Expected) { throw "$Label expected=$Expected actual=$Actual" }
}
function Run-Fixture {
    param([string]$Name)
    $raw = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $PSCommandPath -FixtureCase $Name 2>&1
    $childExit = $LASTEXITCODE
    $line = @($raw | ForEach-Object { [string]$_ } | Where-Object { $_.StartsWith('FIXTURE ') }) | Select-Object -Last 1
    if (-not $line) { throw "Missing fixture result; exit=$childExit output=$($raw | Out-String)" }
    $result = $line.Substring(8) | ConvertFrom-Json
    $result | Add-Member -NotePropertyName childExit -NotePropertyValue $childExit
    return $result
}
$passed = 0
$failed = 0
foreach ($case in @('cold-ready', 'cold-stack', 'missing-manifest', 'wrong-id', 'stack-failed', 'running-legacy', 'no-restart', 'cdp-ready', 'core-ready-other-missing')) {
    try {
        $r = Run-Fixture $case
        Assert-Equal $r.stops 0 "$case app closes/stops"
        Assert-Equal $r.stackCalls 0 "$case child service invocations"
        Assert-Equal $r.coreEnsureCalls 0 "$case unsafe core ensure invocations"
        switch ($case) {
            'cold-ready' {
                Assert-Equal $r.childExit 0 'healthy cold exit'
                Assert-Equal $r.launches 1 'single cold launch'
                Assert-Equal $r.stackCalls 0 'healthy stack reused'
                Assert-Equal $r.coreEnsureCalls 0 'healthy core reused'
                Assert-Equal $r.error '' 'readiness before app'
            }
            'cold-stack' {
                Assert-Equal $r.childExit 0 'cold stack exit'
                Assert-Equal $r.healthProbes 3 'external startup ready on third probe'
                Assert-Equal $r.launches 1 'single cold app launch'
                Assert-Equal $r.error '' 'post-stack readiness before app'
            }
            { $_ -in @('missing-manifest', 'wrong-id', 'stack-failed', 'core-ready-other-missing') } {
                Assert-Equal $r.childExit 1 "$case fail-closed exit"
                Assert-Equal $r.launches 0 "$case blocks app"
                if ($case -eq 'core-ready-other-missing') {
                    Assert-Equal ($r.checked -contains 'http://127.0.0.1:3400/health') $true 'existing core health retained'
                    Assert-Equal ($r.checked -contains 'http://127.0.0.1:8080/manifest.json') $true 'existing core manifest retained'
                    Assert-Equal ($r.checked -contains 'http://127.0.0.1:8085/manifest.json') $false 'missing PDF remains blocked'
                }
            }
            'running-legacy' {
                Assert-Equal $r.launches 0 'legacy flag cannot relaunch running app'
                Assert-Equal $r.focuses 1 'existing window focus preserved'
                Assert-Equal $r.childExit 0 'running-app preserved exit'
            }
            'no-restart' {
                Assert-Equal $r.launches 0 'NoRestart app launches'
                Assert-Equal $r.focuses 0 'NoRestart app focus'
                Assert-Equal $r.childExit 1 'NoRestart missing CDP exit'
            }
            'cdp-ready' {
                Assert-Equal $r.launches 0 'ready CDP app untouched'
                Assert-Equal $r.stackCalls 0 'ready CDP stack untouched'
                Assert-Equal $r.coreEnsureCalls 0 'ready CDP core untouched'
                Assert-Equal $r.childExit 0 'ready CDP exit'
                Assert-Equal @($r.checked | Select-Object -Unique).Count 6 'all startup endpoints checked'
            }
        }
        $passed++
        Write-Output "PASS $case"
    } catch {
        $failed++
        Write-Output "FAIL $case : $($_.Exception.Message)"
    }
}
Write-Output "RESULT passed=$passed failed=$failed total=$($passed + $failed) realAppServiceNetworkTouched=false"
if ($failed) { exit 1 }
