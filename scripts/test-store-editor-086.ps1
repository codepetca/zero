# Temporary exact-candidate check on a disposable hosted desktop. No sign-in,
# student data, network debug port, editor internals or package-source patches.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Data, [Parameter(Mandatory)][string]$ExtensionPath,
      [Parameter(Mandatory)][string]$Kit, [Parameter(Mandatory)][string]$Receipt,
      [ValidateRange(60,600)][int]$TimeoutSeconds = 240)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-editor-window.ps1')
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or
    $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ARCH -ne 'X64') {
    throw 'Manual dispatch on a disposable x64 hosted Windows runner is required.'
}
if ((Test-Path -LiteralPath $Receipt) -or -not [IO.Path]::IsPathRooted($Receipt)) { throw 'A new absolute receipt is required.' }
$manifest = Get-Content -LiteralPath (Join-Path $Kit 'setup\windows-downloads.json') -Raw | ConvertFrom-Json
$pin = $manifest.architectures.x64.vscode.sha256
if ($pin -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid pinned VS Code.' }
$code = Join-Path $Data ("runtime\vscode-$pin\Code.exe")
if (-not (Test-Path -LiteralPath $code -PathType Leaf)) { throw 'The actual private VS Code runtime is missing.' }
$scratch = Join-Path $env:RUNNER_TEMP ('z086-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
$profile = Join-Path $scratch 'profile'
$project = Join-Path $scratch 'project'
$signals = Join-Path $scratch 'signals'
$result = [ordered]@{schema=1; version='0.5.86'; outcome='failed'; startPage=$false; sourceError=$false; cleanup=$false;
    execution='exact installed Zero bytes, VS Code supported development/test host, offline policy';
    limits=@('Real MSIX first-run is checked separately. This host deliberately uses ExtensionMode.Development without an account.',
        'Does not establish authenticated installed-student use, physical Windows 10/11, Store signing, live reporting or publication.')}
function Assert-InstalledVsixSource {
    # VS Code can add install metadata to package.json. Every other packaged
    # extension file is compared byte-for-byte to the exact embedded VSIX.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $vsix = Join-Path $Kit 'zero-0.5.86.vsix'
    $zip = [IO.Compression.ZipFile]::OpenRead($vsix)
    $count = 0
    try {
        foreach ($entry in $zip.Entries) {
            if (-not $entry.FullName.StartsWith('extension/', [StringComparison]::Ordinal) -or $entry.FullName.EndsWith('/') -or $entry.FullName -eq 'extension/package.json') { continue }
            $relative = $entry.FullName.Substring('extension/'.Length)
            if ($relative.Split('/') -contains '..' -or $relative.Contains('\')) { throw 'Unexpected VSIX entry.' }
            $installed = Join-Path $ExtensionPath $relative
            if (-not (Test-Path -LiteralPath $installed -PathType Leaf)) { throw 'Installed extension is incomplete.' }
            $algorithm = [Security.Cryptography.SHA256]::Create()
            $stream = $entry.Open()
            try { $expected = ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
            finally { $stream.Dispose(); $algorithm.Dispose() }
            if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected) { throw 'Installed extension differs from the exact embedded VSIX.' }
            $count++
        }
    } finally { $zip.Dispose() }
    if ($count -lt 10) { throw 'VSIX has insufficient source files.' }
    return [ordered]@{vsixSha256=(Get-FileHash -LiteralPath $vsix -Algorithm SHA256).Hash.ToLowerInvariant(); matchedPackagedFiles=$count; packageJson='version/identity checked separately; install metadata excluded'}
}
$started = [datetime]::UtcNow
try {
    $result['installedSource'] = Assert-InstalledVsixSource
    New-Item -ItemType Directory -Path (Join-Path $profile 'User'),$signals -ErrorAction Stop | Out-Null
    Copy-Item -LiteralPath (Join-Path $Kit 'starter') -Destination $project -Recurse -ErrorAction Stop
    $settings = Get-Content -LiteralPath (Join-Path $Data 'editor\user-data\User\settings.json') -Raw | ConvertFrom-Json
    $settings | Add-Member -NotePropertyName 'zero.automaticPublicProblemReports' -NotePropertyValue $false -Force
    $settings | Add-Member -NotePropertyName 'telemetry.telemetryLevel' -NotePropertyValue 'off' -Force
    $settings | Add-Member -NotePropertyName 'accessibility.support' -NotePropertyValue 'on' -Force
    $settings | Add-Member -NotePropertyName 'security.workspace.trust.enabled' -NotePropertyValue $false -Force
    $settings | Add-Member -NotePropertyName 'workbench.startupEditor' -NotePropertyValue 'none' -Force
    $settings | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $profile 'User\settings.json') -Encoding utf8
    $source = @'
public class Main {
    public static void main(String[] args) {
        System.out.println("ZERO_SYNTHETIC_COMPILER_ERROR")
    }
}
'@
    [IO.File]::WriteAllText((Join-Path $project 'src\main\java\Main.java'), $source, [Text.UTF8Encoding]::new($false))
    $env:ZERO_EDITOR_PROOF_DIRECTORY = $signals
    $env:ZERO_EDITOR_PROOF_EXTENSION = $ExtensionPath
    $env:ZERO_EDITOR_PROOF_PROJECT = $project
    $hostEntry = Join-Path $PSScriptRoot 'windows-editor-proof-086\host.cjs'
    $arguments = @('--new-window','--force-renderer-accessibility','--disable-workspace-trust','--skip-welcome','--skip-release-notes',
        '--user-data-dir', $profile, '--extensions-dir', (Join-Path $Data 'editor\extensions'),
        "--extensionDevelopmentPath=$ExtensionPath", "--extensionTestsPath=$hostEntry", '--disable-extension=redhat.java', $project)
    $quoted = @($arguments | ForEach-Object { if ($_ -match '["\r\n]') { throw 'Unexpected argument character.' }; '"' + $_ + '"' })
    $process = Start-Process -FilePath $code -ArgumentList $quoted -PassThru
    $state = @{}
    $completed = @{}
    $deadline = [datetime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([datetime]::UtcNow -lt $deadline) {
        $hostReceipt = Join-Path $signals 'host-proof.json'
        if (Test-Path -LiteralPath $hostReceipt) {
            $hostResult = Get-Content -LiteralPath $hostReceipt -Raw | ConvertFrom-Json
            $result['host'] = $hostResult
            if ($hostResult.outcome -eq 'passed' -and $result.startPage -and $result.sourceError) { $result.outcome='passed'; break }
            throw 'The editor test host did not complete its exact-candidate checks.'
        }
        $phaseFile = Join-Path $signals 'phase.json'
        if (-not (Test-Path -LiteralPath $phaseFile)) { Start-Sleep -Milliseconds 500; continue }
        $phase = (Get-Content -LiteralPath $phaseFile -Raw | ConvertFrom-Json).phase
        if ($phase -notin @('start-page','source-error')) { throw 'Unexpected test phase.' }
        $result['phase'] = $phase
        if ($completed[$phase]) { Start-Sleep -Milliseconds 500; continue }
        $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
        if (-not (Get-ZeroEditorWindowProof -State $state -ProfilePaths @($profile) -Started $started -Windows @($windows))) { Start-Sleep -Milliseconds 500; continue }
        $window = @($windows | Where-Object { $_.Current.ProcessId -eq $state.ProcessId -and $_.Current.NativeWindowHandle -eq $state.WindowHandle })
        if ($window.Count -ne 1) { throw 'Could not identify one owned editor window.' }
        $elements = @($window[0].FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { -not $_.Current.IsOffscreen })
        $proved = $false
        if ($phase -eq 'start-page') {
            $version = @($elements | Where-Object { $_.Current.Name.Trim() -ceq 'Zero 0.5.86' })
            $tagline = @($elements | Where-Object { $_.Current.Name.Trim() -ceq 'Starting from zero' })
            $result['startPageAccessibleNodes'] = [ordered]@{version=$version.Count; tagline=$tagline.Count}
            $proved = @($version | Where-Object { $v=$_; @($tagline | Where-Object { $v.Current.BoundingRectangle.Top -ge $_.Current.BoundingRectangle.Bottom -and $v.Current.BoundingRectangle.Height -gt 0 }).Count -gt 0 }).Count -gt 0
            if ($proved) { $result.startPage = $true }
        } else {
            $buttons = @($elements | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button })
            $problems = @($buttons | Where-Object { $_.Current.Name -ceq 'Show Problems' })
            $extra = @($buttons | Where-Object { $_.Current.Name -cin @('Show Output','Report a problem') })
            $result['recoveryAccessibleButtons'] = [ordered]@{problems=$problems.Count; otherRecovery=$extra.Count}
            $proved = $problems.Count -eq 1 -and $extra.Count -eq 0
            if ($proved) { $result.sourceError = $true; $result['recoveryActions'] = @('Show Problems') }
        }
        if ($proved) {
            # Screenshots contain only the disposable profile and synthetic project.
            Add-Type -AssemblyName System.Drawing
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try { $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size); $bitmap.Save((Join-Path (Split-Path -Parent $Receipt) "$phase.png"), [Drawing.Imaging.ImageFormat]::Png) }
            finally { $graphics.Dispose(); $bitmap.Dispose() }
            [IO.File]::WriteAllText((Join-Path $signals "$phase.ack"), 'verified')
            $completed[$phase] = $true
        }
        Start-Sleep -Milliseconds 500
    }
    if ($result.outcome -ne 'passed') { throw 'Visible Windows editor checks timed out.' }
    $result['retainedSource'] = Assert-InstalledVsixSource
} catch {
    $result['failure'] = 'editor-host-or-accessibility-check-failed'
    throw
} finally {
    # Only processes tied to this exact disposable profile are ours to stop.
    foreach ($item in @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) })) {
        try { & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $item.ProcessId /T /F 2>&1 | Out-Null } catch { }
    }
    $hostReceipt = Join-Path $signals 'host-proof.json'
    if (Test-Path -LiteralPath $hostReceipt) { $result['host'] = Get-Content -LiteralPath $hostReceipt -Raw | ConvertFrom-Json }
    try {
        for ($attempt=0; $attempt -lt 10; $attempt++) {
            try { if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction Stop }; $result.cleanup=$true; break }
            catch { if ($attempt -eq 9) { throw }; Start-Sleep -Seconds 1 }
        }
    }
    catch { $result.outcome='failed'; $result['cleanupFailure']=$true }
    $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Receipt -Encoding utf8
    if (-not $result.cleanup) { throw 'Synthetic editor state cleanup failed.' }
}
