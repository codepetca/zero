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
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IZeroActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
}
[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class ZeroActivationManager { }
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
$activatedPid = [ZeroActivation]::Launch("$PackageFamily!Zero")
if (-not $activatedPid) { throw 'MSIX activation returned no process ID.' }
$consentDeadline = [DateTime]::UtcNow.AddSeconds(120)
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while ([DateTime]::UtcNow -lt $deadline) {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($window in $windows) {
        $title = $window.Current.Name
        if ($title -match 'java\.exe.*(System Error|Application Error)' -or $title -match 'javac\.exe.*(System Error|Application Error)') {
            throw 'Java displayed a Windows system error during packaged first-run setup.'
        }
        if (-not $accepted -and $title -eq 'Prepare Zero') {
            $buttonCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Yes')
            $button = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
            if ($button) {
                $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                $pattern.Invoke(); $accepted = $true
            }
        }
    }
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
            $windowText += @($children | ForEach-Object { $_.Current.Name } | Where-Object { $_ -match 'Preparing|Try again|Details|could not open|error|Java|download' } | Select-Object -First 4)
        }
        $summary = (($windowText -join '|').Replace($env:USERPROFILE, '<user>'))
        if ($summary.Length -gt 160) { $summary = $summary.Substring(0, 160) }
        throw ('Consent absent; alive={0}; titles={1}; text={2}' -f $live, ($zeroWindows -join '|'), $summary)
    }
    Start-Sleep -Seconds 1
}
if (-not $accepted) { throw 'The dependency consent dialog was not found and accepted.' }
if (-not (Test-Path -LiteralPath $marker)) { throw 'MSIX first-run setup did not reach editor handoff.' }
$settings = Get-Content -LiteralPath (Join-Path $data 'editor\user-data\User\settings.json') -Raw | ConvertFrom-Json
$runtimes = @($settings.'java.configuration.runtimes' | Where-Object { $_.name -eq 'JavaSE-21' -and $_.default -eq $true })
if ($runtimes.Count -ne 1) { throw 'Expected one default Java 21 runtime.' }
$java = [IO.Path]::GetFullPath($runtimes[0].path)
if (-not $java.StartsWith((Join-Path $logicalData 'runtime\jdk-'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Java is outside the private runtime.' }
$physicalJava = Join-Path $data $java.Substring($logicalData.Length).TrimStart('\')
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
if (-not @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($logicalData) -and $_.CreationDate.ToUniversalTime() -ge $started }).Count) { throw 'The isolated VS Code process was not observed.' }
Write-Host 'MSIX first-run setup, private Java, VS Code and Java extension verified.'
