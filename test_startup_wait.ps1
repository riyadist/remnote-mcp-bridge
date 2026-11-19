#Requires -Version 5.1
# Executes the actual launcher main body with isolated process/network boundaries.
param([switch]$FixtureChild, [string]$SharedDirectory = '', [string]$WatcherCase = '')
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start_remnote_pdf_translate.ps1'
if ($FixtureChild) {
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($launcher, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
    foreach ($definition in $ast.EndBlock.Statements) {
        if ($definition -is [System.Management.Automation.Language.FunctionDefinitionAst]) {
            . ([scriptblock]::Create($definition.Extent.Text))
        }
    }
    if ($WatcherCase) {
        if ($WatcherCase -notin @('unguarded','missing')) { throw 'Unknown watcher fixture' }
        $root = Join-Path $SharedDirectory 'bridge'
        $script:watcherStarts = 0
        $script:watcherStops = 0
        $script:watcherArguments = ''
        function Get-CimInstance {
            param($ClassName, $Filter, $ErrorAction)
            if ($WatcherCase -eq 'unguarded') {
                [pscustomobject]@{ProcessId=202;CommandLine='powershell.exe -File watch_remnote_stack.ps1'}
            }
        }
        function Stop-Process {
            param($Id, [switch]$Force, $ErrorAction)
            $script:watcherStops++
            throw 'Forbidden watcher stop'
        }
        function Start-Process {
            param($FilePath, $ArgumentList, $WindowStyle, [switch]$PassThru)
            $script:watcherStarts++
            $script:watcherArguments = [string]$ArgumentList
            if ($FilePath -ne 'powershell.exe' -or $WindowStyle -ne 'Hidden') { throw 'Unexpected watcher process boundary' }
            return [pscustomobject]@{Id=303}
        }
        $watcher = Start-StackWatcherIfMissing
        if ($script:watcherStops -ne 0) { throw 'Watcher was stopped' }
        if ($WatcherCase -eq 'unguarded') {
            if ($watcher.pid -ne 202 -or $watcher.started -ne $false -or
                $watcher.reason -ne 'existing_watcher_preserved_guard_not_enabled' -or
                $watcher.guardEnabled -ne $false -or $script:watcherStarts -ne 0) {
                throw 'Existing unguarded watcher preservation/report contract failed'
            }
        } else {
            if ($watcher.pid -ne 303 -or $watcher.started -ne $true -or
                $script:watcherStarts -ne 1 -or
                $script:watcherArguments -notmatch '(?:^|\s)-EnablePdfTranslateGuard(?:\s|$)') {
                throw 'Missing watcher must start once with guard enabled'
            }
        }
        Write-Output "PASS actual watcher function $WatcherCase stops=0"
        exit 0
    }
    $begin = $ast.Find({ param($node)
        $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
        $node.Left.Extent.Text -eq '$launcherMutex'
    }, $true)
    if (-not $begin) { throw 'Actual launcher mutex/main boundary missing' }
    $source = Get-Content -LiteralPath $launcher -Raw
    $body = $source.Substring($begin.Extent.StartOffset)
    $root = Join-Path $SharedDirectory 'bridge'
    $CdpPort = 9233
    $ManifestPort = 8080
    $BridgeHttpPort = 3400
    $BridgeWsPort = 3401
    $StartupWaitSeconds = 1
    $NoRestart = $false
    $AllowRestartRunningRemNote = $false
    $script:fixtureCdp = $false
    $script:statePath = Join-Path $SharedDirectory 'app-state.json'
    $script:startPath = Join-Path $SharedDirectory 'app-starts.txt'
    $script:stopPath = Join-Path $SharedDirectory 'forbidden-stops.txt'
    $script:mutexName = 'Local\RemNoteLauncherFixture-' + (Split-Path $SharedDirectory -Leaf)
    function New-LauncherStartupMutex {
        return (New-Object System.Threading.Mutex($false, $script:mutexName))
    }
    function Get-StartupStackMissing { return @() }
    function Test-PortListening { param([int]$Port) return $script:fixtureCdp }
    function Get-RemNoteExecutablePath { return 'C:\fixture\RemNote.exe' }
    function Get-Process {
        param($Name, $ErrorAction)
        if ([IO.File]::Exists($script:statePath)) {
            $state = Get-Content -LiteralPath $script:statePath -Raw | ConvertFrom-Json
            $process = [pscustomobject]@{
                Id = [int]$state.pid; Path = 'C:\fixture\RemNote.exe'
                MainWindowHandle = 0; StartTime = [DateTime]$state.created
            }
            $process | Add-Member ScriptMethod CloseMainWindow {
                [IO.File]::AppendAllText($script:stopPath, "close`r`n")
                throw 'Forbidden app close'
            }
            return $process
        }
    }
    function Stop-Process {
        param($Id, [switch]$Force, $ErrorAction)
        [IO.File]::AppendAllText($script:stopPath, "stop`r`n")
        throw 'Forbidden process stop'
    }
    function powershell.exe { throw 'Forbidden child service starter' }
    function Start-Process {
        param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru)
        if ($FilePath -ne 'C:\fixture\RemNote.exe' -or $ArgumentList -ne '--remote-debugging-port=9233') {
            throw "Forbidden process boundary: $FilePath"
        }
        [IO.File]::AppendAllText($script:startPath, "app`r`n")
        [IO.File]::WriteAllText($script:statePath, '{"pid":101,"created":"2026-01-01T00:00:00Z"}')
        [Threading.Thread]::Sleep(150)
        $script:fixtureCdp = $true
    }
    function Get-CimInstance {
        param($ClassName, $Filter, $ErrorAction)
        [pscustomobject]@{ProcessId = 202; CommandLine = 'powershell.exe -File watch_remnote_stack.ps1 -EnablePdfTranslateGuard'}
    }
    function Start-Sleep { param($Milliseconds, $Seconds) [Threading.Thread]::Sleep(10) }
    & ([scriptblock]::Create($body))
    exit 0
}
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Start-FixtureChild([string]$Directory, [string]$Watcher = '') {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $psi.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -FixtureChild -SharedDirectory "' + $Directory + '"'
    if ($Watcher) { $psi.Arguments += ' -WatcherCase ' + $Watcher }
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    return [Diagnostics.Process]::Start($psi)
}
function Wait-FixtureChild($Process) {
    try {
        if (-not $Process.WaitForExit(30000)) { throw "Fixture child timeout pid=$($Process.Id); not killed" }
        if ($Process.ExitCode -ne 0) { throw "Fixture child exit=$($Process.ExitCode)" }
    } finally { $Process.Dispose() }
}
$directory = Join-Path ([IO.Path]::GetTempPath()) ('remnote-launch-fixture-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory((Join-Path $directory 'bridge')) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $directory 'remnote_host')) | Out-Null
[IO.File]::WriteAllText((Join-Path $directory 'bridge\start_remnote_cdp_toolbar_injector.ps1'), '[pscustomobject]@{ok=$true;started=$false}')
[IO.File]::WriteAllText((Join-Path $directory 'remnote_host\watch_remnote_stack.ps1'), '# Fixture presence only; never executed')
$one = Start-FixtureChild $directory
$two = Start-FixtureChild $directory
Wait-FixtureChild $one
Wait-FixtureChild $two
$startsPath = Join-Path $directory 'app-starts.txt'
$stopsPath = Join-Path $directory 'forbidden-stops.txt'
$statePath = Join-Path $directory 'app-state.json'
Assert-True ([IO.File]::Exists($startsPath)) 'Cold launch boundary was not reached'
Assert-True (@(Get-Content -LiteralPath $startsPath).Count -eq 1) 'Concurrent launches duplicated app start'
Assert-True (-not [IO.File]::Exists($stopsPath)) 'App/process stop attempted'
Write-Output 'PASS concurrent actual-mainbody children start app boundary once'
$before = [IO.File]::ReadAllText($statePath)
$existing = Start-FixtureChild $directory
Wait-FixtureChild $existing
$after = [IO.File]::ReadAllText($statePath)
Assert-True ($before -ceq $after) 'Existing PID/creation state changed'
Assert-True (@(Get-Content -LiteralPath $startsPath).Count -eq 1) 'Existing app relaunched'
Assert-True (-not [IO.File]::Exists($stopsPath)) 'Existing app stopped'
Write-Output 'PASS existing fixture PID and creation preserved across repeated launch'
foreach ($watcherCase in @('unguarded','missing')) {
    $watcherChild = Start-FixtureChild $directory $watcherCase
    Wait-FixtureChild $watcherChild
}
$budgetTokens=$null; $budgetErrors=$null
$budgetAst=[Management.Automation.Language.Parser]::ParseFile($launcher,[ref]$budgetTokens,[ref]$budgetErrors)
if ($budgetErrors.Count) { throw ($budgetErrors|Out-String) }
$budgetParam=$budgetAst.ParamBlock.Parameters|Where-Object {$_.Name.VariablePath.UserPath -eq 'StartupWaitSeconds'}
if ($budgetParam.DefaultValue.Value -ne 420) { throw 'Default must be 420 seconds' }
$range=$budgetParam.Attributes|Where-Object {$_.TypeName.Name -eq 'ValidateRange'}
if ($range.PositionalArguments[0].Value -ne 1 -or $range.PositionalArguments[1].Value -ne 600) { throw 'Range must be 1..600' }
$assignment=$budgetAst.Find({param($n)
    $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$launcherWaitMs'
},$true)
if (-not $assignment -or $assignment.Right.Extent.Text -cne '($StartupWaitSeconds + 60) * 1000') { throw 'Mutex budget must derive from readiness plus 60 seconds' }
$wait=$budgetAst.Find({param($n)
    $n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and
    $n.Expression.Extent.Text -eq '$launcherMutex' -and $n.Member.Extent.Text -eq 'WaitOne'
},$true)
if (-not $wait -or $wait.Arguments.Count -ne 1 -or $wait.Arguments[0].Extent.Text -cne '$launcherWaitMs') { throw 'Actual mutex call does not use derived wait' }
Write-Output 'PASS measured-startup source contract default420/max600; mutex follows readiness budget'
Write-Output ('RESULT proposedTests=5 productionRuntimeTouched=false fixture=' + $directory)
