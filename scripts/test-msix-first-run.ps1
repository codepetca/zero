# Runs only inside the disposable hosted runner after the exact MSIX is installed.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PackageFamily, [Parameter(Mandatory)][string]$KitVersion,
      [ValidateRange(60,1200)][int]$TimeoutSeconds = 900)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') { throw 'A disposable GitHub-hosted Windows runner is required.' }
if ($PackageFamily -ne 'Codepet.zerostudio_g62pw1js6rhjp') { throw 'Unexpected package family.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IZeroActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
}
[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class ZeroActivationManager { }
public static class ZeroFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool SetPhysicalCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    private delegate bool EnumChildProc(IntPtr hwnd, IntPtr extra);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumChildProc callback, IntPtr extra);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, StringBuilder text, uint flags, uint timeout, out UIntPtr result);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    public static string DescribeChildren(IntPtr parent) {
        var items = new List<string>();
        EnumChildWindows(parent, (hwnd, unused) => {
            var name = new StringBuilder(128); var cls = new StringBuilder(128); UIntPtr read;
            SendMessageTimeout(hwnd, 0x000D, (IntPtr)name.Capacity, name, 2, 1000, out read); GetClassName(hwnd, cls, cls.Capacity);
            if (IsWindowVisible(hwnd)) items.Add(cls.ToString() + ":" + name.ToString());
            return true;
        }, IntPtr.Zero);
        return string.Join("|", items.ToArray());
    }
    public static bool OpenDetails(IntPtr parent, uint expectedPid) {
        IntPtr found = IntPtr.Zero; int count = 0;
        EnumChildWindows(parent, (hwnd, unused) => {
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            var name = new StringBuilder(128); var cls = new StringBuilder(128);
            UIntPtr read; SendMessageTimeout(hwnd, 0x000D, (IntPtr)name.Capacity, name, 2, 1000, out read); GetClassName(hwnd, cls, cls.Capacity);
            if (pid == expectedPid && IsWindowVisible(hwnd) && (cls.ToString().Equals("Button", StringComparison.OrdinalIgnoreCase) || cls.ToString().IndexOf(".BUTTON.", StringComparison.OrdinalIgnoreCase) >= 0) && (name.ToString() == "Details…" || name.ToString() == "Details...")) { found = hwnd; count++; }
            return true;
        }, IntPtr.Zero);
        if (count != 1) return false;
        return PostMessage(found, 0x00F5, IntPtr.Zero, IntPtr.Zero); // BM_CLICK
    }
}
public static class ZeroActivation {
    public static uint Launch(string id) {
        var manager = (IZeroActivationManager)new ZeroActivationManager();
        uint processId;
        int result = manager.ActivateApplication(id, null, 0, out processId);
        if (result != 0) Marshal.ThrowExceptionForHR(result);
        return processId;
    }
}
'@
$started = [DateTime]::UtcNow
$dataPaths = @((Join-Path $env:LOCALAPPDATA 'ZeroStudioStoreData'), (Join-Path $env:LOCALAPPDATA 'Packages\Codepet.zerostudio_g62pw1js6rhjp\LocalCache\Local\ZeroStudioStoreData'))
$logicalData = $dataPaths[0]
$data = $logicalData
$project = Join-Path $env:USERPROFILE 'Zero Studio'
foreach ($path in @($dataPaths + @($project))) { if (Test-Path -LiteralPath $path) { throw 'Store setup state already exists; use a clean disposable account.' } }
$marker = Join-Path $data 'editor-opened'
$extensions = Join-Path $data 'editor\extensions'
$accepted = $false
$attempted = $false
$activatedPid = [ZeroActivation]::Launch("$PackageFamily!Zero")
if (-not $activatedPid) { throw 'MSIX activation returned no process ID.' }
$consentDeadline = [DateTime]::UtcNow.AddSeconds(120)
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while ([DateTime]::UtcNow -lt $deadline) {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($window in $windows) {
        $title = $window.Current.Name
        if ($title -match 'java\.exe.*(System Error|Application Error|Entry Point Not Found)' -or $title -match 'javac\.exe.*(System Error|Application Error|Entry Point Not Found)') {
            $messages = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name } | Where-Object { $_ } | Select-Object -First 8)
            Add-Type -AssemblyName System.Drawing
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
                $bitmap.Save((Join-Path $env:RUNNER_TEMP 'zero-msix-consent-diagnostic.png'), [Drawing.Imaging.ImageFormat]::Png)
            } finally { $graphics.Dispose(); $bitmap.Dispose() }
            throw ('Java displayed a Windows system error during packaged first-run setup: ' + (($messages -join '|').Replace($env:USERPROFILE, '<user>')))

        }
        if ($accepted -and $window.Current.ProcessId -eq $activatedPid -and $title -eq 'Zero') {
            $hwnd = [IntPtr]$window.Current.NativeWindowHandle
            if ($hwnd -ne [IntPtr]::Zero -and [ZeroFocus]::OpenDetails($hwnd, $activatedPid)) {
                Start-Sleep -Seconds 2
                $roots = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
                $messages = @()
                foreach ($w in $roots) { if ($w.Current.ProcessId -eq $activatedPid) { $messages += @($w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name } | Where-Object { $_ } | Select-Object -First 12) } }
                Add-Type -AssemblyName System.Drawing
                $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
                try { $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size); $bitmap.Save((Join-Path $env:RUNNER_TEMP 'zero-msix-consent-diagnostic.png'), [Drawing.Imaging.ImageFormat]::Png) } finally { $graphics.Dispose(); $bitmap.Dispose() }
                throw ('Zero setup reported an error: ' + (($messages -join '|').Replace($env:USERPROFILE, '<user>')))
            }
        }
        if (-not $attempted -and $window.Current.ProcessId -eq $activatedPid -and $title -in @('Prepare Zero', 'Zero')) {
            $descendants = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
            $hasConsentText = @($descendants | Where-Object { $_.Current.Name -like 'Zero needs to download Java*' }).Count -gt 0
            if (-not $hasConsentText) { continue }
            $nameCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Yes')
            $typeCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
            $buttonCondition = New-Object System.Windows.Automation.AndCondition($nameCondition, $typeCondition)
            $button = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
            if ($button) {
                $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                $pattern.Invoke(); $attempted = $true
            } else {
                $hwnd = [IntPtr]$window.Current.NativeWindowHandle
                if ($hwnd -eq [IntPtr]::Zero -or -not [ZeroFocus]::SetForegroundWindow($hwnd)) { throw 'Could not focus the packaged consent dialog.' }
                $foregroundPid = [uint32]0
                [void][ZeroFocus]::GetWindowThreadProcessId([ZeroFocus]::GetForegroundWindow(), [ref]$foregroundPid)
                if ($foregroundPid -ne $activatedPid -or [ZeroFocus]::GetForegroundWindow() -ne $hwnd) { throw 'Consent dialog did not own foreground focus.' }
                # The accessible tree exposes the Yes label, but not its button.
                # On this disposable desktop click the center of that exact label.
                $yes = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $nameCondition)
                if (-not $yes) { throw 'Consent Yes label was not found.' }
                $rect = $yes.Current.BoundingRectangle
                $outer = $window.Current.BoundingRectangle
                $x = [int]($rect.X + $rect.Width / 2); $y = [int]($rect.Y + $rect.Height / 2)
                if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0 -or $x -lt $outer.Left -or $x -ge $outer.Right -or $y -lt $outer.Top -or $y -ge $outer.Bottom) { throw 'Consent Yes label is outside the activated window.' }
                if ([ZeroFocus]::GetForegroundWindow() -ne $hwnd -or -not [ZeroFocus]::SetPhysicalCursorPos($x, $y)) { throw 'Consent dialog lost focus before clicking.' }
                [ZeroFocus]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
                [ZeroFocus]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
                $attempted = $true
            }
        }
    }
    if ($attempted -and @($dataPaths | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'dependency-consent-v1') }).Count -gt 0) { $accepted = $true }
    $found = @($dataPaths | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'editor-opened') })
    if ($found.Count -gt 1) { throw 'Ambiguous package data paths.' }
    if ($found.Count -eq 1 -and $accepted) { $data = $found[0]; $marker = Join-Path $data 'editor-opened'; $extensions = Join-Path $data 'editor\extensions'; break }
    if (-not $accepted -and [DateTime]::UtcNow -ge $consentDeadline) {
        $live = @(Get-Process -Id $activatedPid -ErrorAction SilentlyContinue).Count -gt 0
        $zeroWindows = @($windows | Where-Object { $_.Current.Name -match '^(Zero|Prepare Zero|java|javac)' } | ForEach-Object { $_.Current.Name.Substring(0, [Math]::Min($_.Current.Name.Length, 80)) })
        $windowText = @()
        foreach ($window in $windows) {
            if ($window.Current.Name -ne 'Zero' -or $window.Current.ProcessId -ne $activatedPid) { continue }
            $children = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
            $windowText += @($children | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button } | ForEach-Object { 'button:' + $_.Current.Name } | Select-Object -First 8)
            $windowText += @($children | ForEach-Object { $_.Current.Name } | Where-Object { $_ -match 'Preparing|Try again|Details|could not open|error|Java|download' } | Select-Object -First 2)
        }
        $summary = (($windowText -join '|').Replace($env:USERPROFILE, '<user>'))
        if ($summary.Length -gt 160) { $summary = $summary.Substring(0, 160) }
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
            $bitmap.Save((Join-Path $env:RUNNER_TEMP 'zero-msix-consent-diagnostic.png'), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
        throw ('Consent absent; alive={0}; titles={1}; text={2}' -f $live, ($zeroWindows -join '|'), $summary)
    }
    Start-Sleep -Seconds 1
}
if (-not $accepted) { throw 'The dependency consent dialog was not found and accepted.' }
if (-not (Test-Path -LiteralPath $marker)) {
    $state = @()
    foreach ($path in $dataPaths) {
        $runtime = Join-Path $path 'runtime'
        if (Test-Path -LiteralPath $runtime) {
            $state += @(Get-ChildItem -LiteralPath $runtime -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                '{0}:java={1}:jli={2}:node={3}:code={4}' -f $_.Name, (Test-Path (Join-Path $_.FullName 'bin\java.exe')), (Test-Path (Join-Path $_.FullName 'bin\jli.dll')), (Test-Path (Join-Path $_.FullName 'node.exe')), (Test-Path (Join-Path $_.FullName 'Code.exe'))
            })
        }
    }
    $titles = @($windows | Where-Object { $_.Current.ProcessId -eq $activatedPid -or $_.Current.Name -match 'java|javac' } | ForEach-Object { $_.Current.Name } | Select-Object -First 8)
    foreach ($w in $windows) {
        if ($w.Current.ProcessId -ne $activatedPid) { continue }
        $names = @($w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.ControlType.ProgrammaticName + ':' + $_.Current.Name } | Select-Object -First 20)
        Write-Host ('Zero UIA: ' + (($names -join '|').Replace($env:USERPROFILE, '<user>')))
        Write-Host ('Zero HWND: ' + ([ZeroFocus]::DescribeChildren([IntPtr]$w.Current.NativeWindowHandle).Replace($env:USERPROFILE, '<user>')))
    }
    Add-Type -AssemblyName System.Drawing
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save((Join-Path $env:RUNNER_TEMP 'zero-msix-consent-diagnostic.png'), [Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    throw ('MSIX setup did not reach editor handoff; windows={0}; runtime={1}' -f ($titles -join '|'), ($state -join '|'))
}
$settings = Get-Content -LiteralPath (Join-Path $data 'editor\user-data\User\settings.json') -Raw | ConvertFrom-Json
$runtimes = @($settings.'java.configuration.runtimes' | Where-Object { $_.name -eq 'JavaSE-21' -and $_.default -eq $true })
if ($runtimes.Count -ne 1) { throw 'Expected one default Java 21 runtime.' }
$java = [IO.Path]::GetFullPath($runtimes[0].path)
if ($java.StartsWith((Join-Path $data 'runtime\jdk-'), [StringComparison]::OrdinalIgnoreCase)) { $physicalJava = $java }
elseif ($java.StartsWith((Join-Path $logicalData 'runtime\jdk-'), [StringComparison]::OrdinalIgnoreCase)) { $physicalJava = Join-Path $data $java.Substring($logicalData.Length).TrimStart('\') }
else { throw 'Java is outside the private runtime.' }
foreach ($relative in @('bin\java.exe','bin\javac.exe','bin\jli.dll')) { if (-not (Test-Path -LiteralPath (Join-Path $physicalJava $relative) -PathType Leaf)) { throw "Private Java is missing $relative." } }
foreach ($exe in @('java.exe', 'javac.exe')) {
    $process = Start-Process -FilePath (Join-Path $physicalJava ('bin\' + $exe)) -ArgumentList '-version' -PassThru -WindowStyle Hidden
    try {
        if (-not $process.WaitForExit(30000)) { $process.Kill(); throw "$exe did not exit within 30 seconds." }
        if ($process.ExitCode -ne 0) { throw "$exe failed to start." }
    } finally { $process.Dispose() }
}
$manifests = @(Get-ChildItem -LiteralPath $extensions -Directory | ForEach-Object { $p = Join-Path $_.FullName 'package.json'; if (Test-Path -LiteralPath $p) { Get-Content -LiteralPath $p -Raw | ConvertFrom-Json } })
if (-not @($manifests | Where-Object { $_.publisher -eq 'zero' -and $_.name -eq 'zero' -and $_.version -eq $KitVersion }).Count -or -not @($manifests | Where-Object { $_.publisher -eq 'redhat' -and $_.name -eq 'java' }).Count) { throw 'Zero or Java extension was not installed.' }
if (-not @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains($logicalData) -or $_.CommandLine.Contains($data)) -and $_.CreationDate.ToUniversalTime() -ge $started }).Count) { throw 'The isolated VS Code process was not observed.' }
Write-Host 'MSIX first-run setup, private Java, VS Code and Java extension verified.'
