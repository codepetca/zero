#requires -Version 5.1
<##
Runs real, network-using installation/bootstrap on a disposable Windows account.
No account/credential operations or global-tool changes. Retains installed files;
discard the VM/account after collecting the receipt. Never use a teaching account.
##>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][switch]$DisposableAccount,
    [string]$BuildReceipt = (Join-Path $PSScriptRoot '..\dist\installers\build-windows.json'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\.verification\windows-installation'),
    [ValidateRange(60, 1200)][int]$BootstrapTimeoutSeconds = 900
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $DisposableAccount) { throw 'Explicit -DisposableAccount is required. This installs and opens real software.' }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
    throw 'Use a disposable Intel/AMD x64 Windows 10/11 account.'
}
$install = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Zero'
$data = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ZeroData'
$project = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Zero'
$userData = Join-Path $data 'editor\user-data'
$extensions = Join-Path $data 'editor\extensions'
$editorArgument = '(?i)(?:^|\s)"?--user-data-dir"?(?:\s+|=)"?' + [regex]::Escape($userData) + '"?(?:\s|$)'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Zero.lnk'
# Refuse all existing Zero state, including files/junctions. Do not delete it.
foreach ($existing in @($install, $data, $project, $shortcut)) {
    if (Get-Item -LiteralPath $existing -Force -ErrorAction SilentlyContinue) { throw 'This account already has Zero state. Use a fresh disposable account; nothing was changed.' }
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Use a new output directory for each installation trial.' }
$null = New-Item -ItemType Directory -Path $OutputDirectory
$events = New-Object 'System.Collections.Generic.List[object]'
$owned = @{}
$started = [DateTime]::UtcNow
$stage = 'validate-build'
$report = [ordered]@{
    schema = 1; startedUtc = $started.ToString('o'); status = 'failed'; stage = $stage
    osVersion = [Environment]::OSVersion.Version.ToString(); powershell = $PSVersionTable.PSVersion.ToString()
    version = $null; sourceRevision = $null; setupSha256 = $null; events = $events; dpiAwareness = $null
    # This receipt cannot promote a release or substitute for the interactive trial.
    interactiveJavaFxTested = $false; signedUpdateTested = $false; nativeWindowsTested = $false
}
function Mark([string]$Name) {
    $script:stage = $Name
    $events.Add([ordered]@{name = $Name; elapsedSeconds = [math]::Round(([DateTime]::UtcNow - $started).TotalSeconds, 1)})
    Write-Host "Windows installation trial: $Name"
}
function Quote-Argument([string]$Value) {
    if ($Value -match '["\r\n\x00]') { throw 'Unsupported process argument.' }
    return '"' + ($Value -replace '(\\+)$', '$1$1') + '"'
}
function Remember-Processes {
    $all = @(Get-CimInstance Win32_Process)
    # Roots must be our exact new launcher/updater, or an editor with our isolated
    # profile in its argv. Descendants are followed using PID + creation time.
    foreach ($item in $all) {
        $isLauncher = $item.ExecutablePath -and @((Join-Path $install 'Zero.exe'), (Join-Path $install 'current\Zero.exe'), (Join-Path $install 'Update.exe')) -contains $item.ExecutablePath
        $isEditor = $item.Name -eq 'Code.exe' -and $item.CommandLine -and $item.CommandLine -match $editorArgument
        if (($isLauncher -or $isEditor) -and $item.CreationDate.ToUniversalTime() -ge $started) { $owned[[int]$item.ProcessId] = $item.CreationDate }
    }
    do {
        $added = $false
        foreach ($item in $all) {
            $pidValue = [int]$item.ProcessId; $parent = [int]$item.ParentProcessId
            if (-not $owned.ContainsKey($pidValue) -and $owned.ContainsKey($parent) -and $item.CreationDate -ge $owned[$parent]) {
                # Do not follow a reused parent PID.
                $liveParent = $all | Where-Object { [int]$_.ProcessId -eq $parent -and $_.CreationDate -eq $owned[$parent] } | Select-Object -First 1
                if ($liveParent) { $owned[$pidValue] = $item.CreationDate; $added = $true }
            }
        }
    } while ($added)
    return $all
}
function Wait-Until([scriptblock]$Condition, [int]$Seconds, [string]$Description) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    do {
        $null = Remember-Processes
        if (& $Condition) { return }
        Start-Sleep -Milliseconds 1000
    } while ($watch.Elapsed.TotalSeconds -lt $Seconds)
    throw "Timed out after $Seconds seconds: $Description. Inspect the trial desktop and private logs."
}
function Invoke-Bounded([string]$Executable, [string[]]$Arguments, [int]$Seconds) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.Arguments = ($Arguments | ForEach-Object { Quote-Argument $_ }) -join ' '
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw 'Could not start the trial subprocess.' }
        $owned[$process.Id] = $process.StartTime
        $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
        $watch = [Diagnostics.Stopwatch]::StartNew()
        while (-not $process.WaitForExit(1000)) {
            $null = Remember-Processes
            if ($watch.Elapsed.TotalSeconds -ge $Seconds) {
                # Only this exact started process; final cleanup handles recorded descendants.
                $process.Kill(); $null = $process.WaitForExit(5000)
                throw "Trial subprocess exceeded its $Seconds-second budget."
            }
        }
        if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout, $stderr), 5000)) { throw 'Trial subprocess output did not close.' }
        if ($process.ExitCode -ne 0) { throw "Trial subprocess exited with code $($process.ExitCode)." }
        return $stdout.Result + $stderr.Result
    } finally { $process.Dispose() }
}
function Editor-Roots {
    return @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object {
        $_.CommandLine -and $_.CommandLine -match $editorArgument -and $_.CreationDate.ToUniversalTime() -ge $started
    })
}
function Open-Launcher([string]$Path) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Path; $info.UseShellExecute = $true
    $process = [Diagnostics.Process]::Start($info)
    if ($process) { $process.Dispose() }
}
try {
    $receipt = Get-Content -LiteralPath $BuildReceipt -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($receipt.schema -ne 1 -or $receipt.kitVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid Windows build receipt.' }
    $asset = @($receipt.artifacts | Where-Object { $_.platform -eq 'windows' -and $_.kind -eq 'installer' })
    if ($asset.Count -ne 1) { throw 'Expected exactly one measured Windows installer.' }
    $asset = $asset[0]
    if ($asset.filename -ne "Zero-Setup-$($receipt.kitVersion)-windows-development.exe" -or $asset.velopackVersion -ne '1.2.161' -or $asset.updaterEnabled -ne $false -or $asset.authenticodeSigned -ne $false) {
        throw 'This automated smoke test requires the pinned unsigned development candidate with updating disabled. Signed release testing is separate.'
    }
    $setup = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($BuildReceipt))) $asset.filename
    $hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $asset.sha256 -or (Get-Item -LiteralPath $setup).Length -ne $asset.size) { throw 'Setup does not match its measured build receipt.' }
    $report.version = $receipt.kitVersion; $report.sourceRevision = $receipt.sourceRevision; $report.setupSha256 = $hash
    Mark 'silent-install'
    # Velopack 1.2.161 --silent suppresses the post-install application launch.
    $null = Invoke-Bounded $setup @('--silent', '--log', (Join-Path $OutputDirectory 'setup.log')) 180
    Mark 'installed-layout-and-shortcut'
    foreach ($relative in @('Zero.exe', 'Update.exe', 'current\Zero.exe', 'current\Zero.exe.config', 'current\Velopack.dll', 'current\sq.version')) {
        if (-not (Test-Path -LiteralPath (Join-Path $install $relative) -PathType Leaf)) { throw "Installed layout is missing $relative." }
    }
    if (-not (Test-Path -LiteralPath $shortcut -PathType Leaf)) { throw 'Zero Start-menu shortcut was not created.' }
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($shortcut)
    # Pinned Velopack shortcuts may target current; the public stub is tested separately.
    if (@((Join-Path $install 'Zero.exe'), (Join-Path $install 'current\Zero.exe')) -notcontains $link.TargetPath -or $link.Arguments) { throw 'Start-menu shortcut does not open the installed Zero launcher.' }
    if ([Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $install 'current\Zero.exe')).FileVersion -ne "$($receipt.kitVersion).0") { throw 'Installed launcher version does not match the candidate.' }
    Mark 'first-launch-real-bootstrap'
    Open-Launcher (Join-Path $install 'Zero.exe')
    Mark 'launcher-dpi-awareness'
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ZeroDpiProbe {
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr window);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AreDpiAwarenessContextsEqual(IntPtr first, IntPtr second);
}
'@
    Wait-Until {
        $observed = $false
        foreach ($item in @(Get-CimInstance Win32_Process -Filter "Name='Zero.exe'")) {
            if ($item.ExecutablePath -ne (Join-Path $install 'current\Zero.exe') -or $item.CreationDate.ToUniversalTime() -lt $started) { continue }
            $process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
            if (-not $process) { continue }
            try {
                $window = $process.MainWindowHandle
                if ($window -eq [IntPtr]::Zero) { continue }
                $context = [ZeroDpiProbe]::GetWindowDpiAwarenessContext($window)
                if (-not [ZeroDpiProbe]::AreDpiAwarenessContextsEqual($context, [IntPtr](-4))) { throw 'Launcher window is not PerMonitorV2 DPI aware.' }
                $report.dpiAwareness = 'PerMonitorV2'
                $observed = $true
            } finally { $process.Dispose() }
        }
        return $observed
    } 30 'actual launcher window with PerMonitorV2 DPI awareness'
    $marker = Join-Path $data 'editor-opened'
    Wait-Until { (Test-Path -LiteralPath $marker) -and @(Editor-Roots).Count -gt 0 } $BootstrapTimeoutSeconds 'real Java/editor/extension preparation and editor handoff'
    Mark 'private-java-and-installed-support'
    $settings = Get-Content -LiteralPath (Join-Path $userData 'User\settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $runtimes = @($settings.'java.configuration.runtimes' | Where-Object { $_.name -eq 'JavaSE-21' -and $_.default -eq $true })
    if ($runtimes.Count -ne 1) { throw 'Expected one default private Java 21 runtime.' }
    $java = [IO.Path]::GetFullPath($runtimes[0].path)
    if (-not $java.StartsWith((Join-Path $data 'runtime\jdk-'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Configured Java is outside the private runtime.' }
    $javaOutput = Invoke-Bounded (Join-Path $java 'bin\java.exe') @('-version') 30
    $javacOutput = Invoke-Bounded (Join-Path $java 'bin\javac.exe') @('-version') 30
    if ($javaOutput -notmatch 'version "21\.' -or $javacOutput -notmatch 'javac 21\.') { throw 'The real private Java tools did not report Java 21.' }
    $installedExtensions = @(Get-ChildItem -LiteralPath $extensions -Directory | ForEach-Object {
        $manifest = Join-Path $_.FullName 'package.json'
        if (Test-Path -LiteralPath $manifest) { Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json }
    })
    if (-not @($installedExtensions | Where-Object { $_.publisher -eq 'zero' -and $_.name -eq 'zero' -and $_.version -eq $receipt.kitVersion }).Count -or
        -not @($installedExtensions | Where-Object { $_.publisher -eq 'redhat' -and $_.name -eq 'java' }).Count) { throw 'Required Zero and Java extensions were not actually installed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $project 'starter\src\main\java\Main.java'))) { throw 'The initial ordinary Java starter was not placed.' }
    Mark 'close-isolated-editor'
    $firstOpened = (Get-Item -LiteralPath $marker).LastWriteTimeUtc
    $null = Remember-Processes
    # The handoff marker records a successful process start, before Electron has
    # necessarily created its first window. Wait for a real close request to be
    # accepted; never substitute a forced process kill for this coverage.
    Wait-Until {
        $requestedClose = $false
        foreach ($item in @(Editor-Roots)) {
            $process = $null
            try {
                $process = [Diagnostics.Process]::GetProcessById([int]$item.ProcessId)
                if ($process.CloseMainWindow()) { $requestedClose = $true }
            } catch [ArgumentException] { } finally { if ($process) { $process.Dispose() } }
        }
        return $requestedClose
    } 60 'isolated editor window accepting graceful close; use an interactive desktop if no window appears'
    Wait-Until { @(Editor-Roots).Count -eq 0 } 60 'isolated editor graceful close'
    Mark 'reopen-from-start-shortcut'
    Open-Launcher $shortcut
    Wait-Until { (Get-Item -LiteralPath $marker).LastWriteTimeUtc -gt $firstOpened -and @(Editor-Roots).Count -gt 0 } 120 'second launcher handoff from the installed shortcut'
    Mark 'passed-development-installation-smoke'
    $report.status = 'passed'
} catch {
    # Keep account paths out of the small receipt. Raw setup.log is private evidence.
    $message = $_.Exception.Message
    foreach ($privatePath in @([Environment]::GetFolderPath('UserProfile'), $OutputDirectory)) { $message = $message.Replace($privatePath, '<trial-path>') }
    $report.error = $message
    Write-Warning $message
} finally {
    # Never kill all Code/java processes or delete application/user directories.
    # Stop only identities discovered under our new launcher/isolated editor.
    try {
        $all = @(Remember-Processes)
        foreach ($item in $all) {
            $pidValue = [int]$item.ProcessId
            if ($owned.ContainsKey($pidValue) -and $owned[$pidValue] -eq $item.CreationDate) {
                $process = $null
                try {
                    $process = [Diagnostics.Process]::GetProcessById($pidValue)
                    # Open/retain the process handle before checking its identity.
                    $null = $process.Handle
                    if ([math]::Abs(($process.StartTime.ToUniversalTime() - $item.CreationDate.ToUniversalTime()).TotalMilliseconds) -lt 1) { $process.Kill() }
                } catch { } finally { if ($process) { $process.Dispose() } }
            }
        }
    } catch { Write-Warning 'Could not finish scoped process cleanup; discard the disposable VM/account.' }
    $report.stage = $stage
    $report.finishedUtc = [DateTime]::UtcNow.ToString('o')
    $report.elapsedSeconds = [math]::Round(([DateTime]::UtcNow - $started).TotalSeconds, 1)
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'report.json') -Encoding UTF8
}
if ($report.status -ne 'passed') { throw "Windows installation smoke failed during $stage. See its report.json and private setup.log." }
