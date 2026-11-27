#requires -Version 5.1
# Real bundled-portable smoke test; only for a fresh GitHub-hosted Windows runner.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Bundle,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$SeedJavaVsix
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or [Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
    -not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
    throw 'This trial requires a disposable GitHub-hosted Windows x64 runner.'
}
$data = Join-Path $env:LOCALAPPDATA 'ZeroPortableData'
$project = Join-Path $env:USERPROFILE 'Zero Portable'
foreach ($path in @($data, $project)) {
    if (Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue) { throw 'Existing portable Zero state found; use a fresh runner.' }
}
$Bundle = [IO.Path]::GetFullPath($Bundle)
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $OutputDirectory) { throw 'OutputDirectory must be new.' }
$null = New-Item -ItemType Directory -Path $OutputDirectory
$started = [DateTime]::UtcNow
$owned = @{}
$stage = 'validate-bundle'
$report = [ordered]@{ schema = 1; status = 'failed'; stage = $stage; startedUtc = $started.ToString('o'); version = $null; sourceRevision = $null; kitSha256 = $null; bundleSha256 = $null; cold = 'not-run'; warm = 'not-run'; interactiveJavaFxTested = $false }
$root = Join-Path $OutputDirectory 'extracted\Zero Portable'
$launcher = Join-Path $root 'Zero.exe'
$tools = Join-Path $root 'tools'
$editor = Join-Path $tools 'vscodium\VSCodium.exe'
$profile = Join-Path $data 'editor\user-data'
$extensions = Join-Path $data 'editor\extensions'
$sharedData = Join-Path $data 'editor\shared-data'
$profilePattern = '(?i)(?:^|\s)"?--user-data-dir"?(?:=|\s+)(?:"' + [regex]::Escape($profile) + '"|' + [regex]::Escape($profile) + ')(?:\s|$)'
function Snapshot-Processes {
    $all = @(Get-CimInstance Win32_Process)
    foreach ($item in $all) {
        $path = $item.ExecutablePath
        $isLauncher = $path -and [string]::Equals($path, $launcher, [StringComparison]::OrdinalIgnoreCase)
        $isEditor = $path -and [string]::Equals($path, $editor, [StringComparison]::OrdinalIgnoreCase) -and $item.CommandLine -and $item.CommandLine -match $profilePattern
        if (($isLauncher -or $isEditor) -and $item.CreationDate.ToUniversalTime() -ge $started) { $owned[[int]$item.ProcessId] = $item.CreationDate }
    }
    do {
        $added = $false
        foreach ($item in $all) {
            $id = [int]$item.ProcessId; $parent = [int]$item.ParentProcessId
            if (-not $owned.ContainsKey($id) -and $owned.ContainsKey($parent) -and $item.CreationDate -ge $owned[$parent] -and
                @($all | Where-Object { [int]$_.ProcessId -eq $parent -and $_.CreationDate -eq $owned[$parent] }).Count) {
                $owned[$id] = $item.CreationDate; $added = $true
            }
        }
    } while ($added)
    return $all
}
function Editor-Roots {
    return @(Get-CimInstance Win32_Process -Filter "Name='VSCodium.exe'" | Where-Object {
        $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $editor, [StringComparison]::OrdinalIgnoreCase) -and
        $_.CommandLine -and $_.CommandLine -match $profilePattern -and $_.CreationDate.ToUniversalTime() -ge $started
    })
}
function Wait-For([scriptblock]$Condition, [int]$Seconds, [string]$Description) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    do {
        $null = Snapshot-Processes
        if (& $Condition) { return }
        Start-Sleep -Seconds 1
    } while ($watch.Elapsed.TotalSeconds -lt $Seconds)
    throw "Timed out waiting for $Description."
}
function Stop-Owned {
    $all = @(Snapshot-Processes)
    foreach ($item in $all) {
        $id = [int]$item.ProcessId
        if ($owned.ContainsKey($id) -and $owned[$id] -eq $item.CreationDate) {
            $process = $null
            try {
                $process = [Diagnostics.Process]::GetProcessById($id)
                $null = $process.Handle
                if ([math]::Abs(($process.StartTime.ToUniversalTime() - $item.CreationDate.ToUniversalTime()).TotalMilliseconds) -lt 1) { $process.Kill() }
            } catch { } finally { if ($process) { $process.Dispose() } }
        }
    }
}
function Quote-Argument([string]$Value) {
    if ($Value -match '["\r\n\x00]') { throw 'Unsupported process argument.' }
    return '"' + ($Value -replace '(\\+)$', '$1$1') + '"'
}
function Test-LanguageServer([datetime]$Since) {
    $file = Join-Path $OutputDirectory 'PortableLanguageServerProbe.java'
    Set-Content -LiteralPath $file -Encoding Ascii -Value 'class PortableLanguageServerProbe {}'
    $arguments = @('--user-data-dir', $profile, '--extensions-dir', $extensions, '--shared-data-dir', $sharedData,
        '--reuse-window', $file) | ForEach-Object { Quote-Argument $_ }
    Start-Process -FilePath $editor -ArgumentList ($arguments -join ' ')
    Start-Sleep -Seconds 10
    Capture-Screen java-open
    $bundledJava = Join-Path $tools 'jdk\bin\java.exe'
    try { Wait-For {
        @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object {
            $owned[[int]$_.ProcessId] -eq $_.CreationDate -and $_.CreationDate.ToUniversalTime() -ge $Since -and
            $_.ExecutablePath -eq $bundledJava -and $_.CommandLine -match '-Declipse.application=org\.eclipse\.jdt\.ls\.core\.id1\b'
        }).Count -gt 0
    } 90 'the Java language server running on the bundled JDK' } catch {
        Capture-Screen java-failure
        $javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | ForEach-Object { [ordered]@{ owned = ($owned[[int]$_.ProcessId] -eq $_.CreationDate); bundled = ($_.ExecutablePath -eq $bundledJava); jdt = ($_.CommandLine -match '-Declipse.application=org\.eclipse\.jdt\.ls\.core\.id1\b') } })
        $report['javaDiagnostics'] = $javaProcesses
        $logs = @(Get-ChildItem -LiteralPath (Join-Path $profile 'logs') -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'redhat.java|exthost' } | Select-Object -First 30)
        $lines = foreach ($log in $logs) { Get-Content -LiteralPath $log.FullName -ErrorAction SilentlyContinue | Where-Object { $_ -match '(?i)redhat.java|language server|jdk|java runtime|java home|java 25|error|exception' } | Select-Object -Last 30 }
        $report['logLines'] = @($lines | ForEach-Object { $line = $_; foreach ($private in @($env:USERPROFILE, $OutputDirectory, $Bundle, $env:GITHUB_WORKSPACE)) { if ($private) { $line = $line.Replace($private, '<trial-path>') } }; $line } | Select-Object -Last 80)
        throw
    }
}
function Capture-Screen([string]$Name) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bounds = [Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try { $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size); $bitmap.Save((Join-Path $OutputDirectory "$Name-screen.png"), [Drawing.Imaging.ImageFormat]::Png) } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
function Installed-Extensions {
    $cli = Join-Path $tools 'vscodium\resources\app\out\cli.js'
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $editor
    $info.Arguments = (@($cli, '--user-data-dir', $profile, '--extensions-dir', $extensions, '--list-extensions', '--show-versions') | ForEach-Object { Quote-Argument $_ }) -join ' '
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
    $p = New-Object Diagnostics.Process; $p.StartInfo = $info
    try {
        if (-not $p.Start()) { throw 'Could not start bundled editor CLI.' }
        $owned[$p.Id] = $p.StartTime
        $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
        $watch = [Diagnostics.Stopwatch]::StartNew()
        while (-not $p.WaitForExit(1000)) {
            $null = Snapshot-Processes
            if ($watch.Elapsed.TotalSeconds -ge 60) { $p.Kill(); throw 'Editor CLI timed out.' }
        }
        if (-not [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($out, $err), 5000)) { throw 'Editor CLI output did not close.' }
        if ($p.ExitCode -ne 0) { throw 'Editor CLI failed.' }
        return @($out.Result -split '\r?\n' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
    } finally { $p.Dispose() }
}
function Tool-Inventory {
    return @(Get-ChildItem -LiteralPath $tools -File -Recurse -Force | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($tools.Length + 1) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    })
}
function Manifest-Inventory {
    return @(Get-ChildItem -LiteralPath $extensions -Directory | ForEach-Object {
        $file = Join-Path $_.FullName 'package.json'
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            $item = Get-Item -LiteralPath $file
            $_.Name + ':' + $item.LastWriteTimeUtc.Ticks + ':' + (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
        }
    } | Sort-Object)
}
try {
    $bundleItem = Get-Item -LiteralPath $Bundle
    if ($bundleItem.PSIsContainer -or $bundleItem.Extension -ne '.zip') { throw 'Expected a bundled ZIP file.' }
    $report.bundleSha256 = (Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash.ToLowerInvariant()
    $sumFile = Join-Path $bundleItem.DirectoryName 'SHA256SUMS.txt'
    $expected = @((Get-Content -LiteralPath $sumFile) | Where-Object { $_ -match '^([a-fA-F0-9]{64})\s+(.+)$' -and $Matches[2] -eq $bundleItem.Name })
    if ($expected.Count -ne 1 -or $expected[0].Substring(0, 64).ToLowerInvariant() -ne $report.bundleSha256) { throw 'Bundle does not match its measured SHA256SUMS.txt.' }
    $stage = 'extract-bundle'
    Expand-Archive -LiteralPath $Bundle -DestinationPath (Join-Path $OutputDirectory 'extracted')
    $build = Get-Content -LiteralPath (Join-Path $root 'BUILD.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $javaPin = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../native-installer/windows/portable-java.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($build.toolDistribution -ne 'bundled' -or $build.kitVersion -notmatch '^\d+\.\d+\.\d+$' -or $build.sourceRevision -notmatch '^[a-f0-9]{40}$' -or $build.kitSha256 -notmatch '^[a-f0-9]{64}$' -or $build.launcherSha256 -notmatch '^[a-f0-9]{64}$' -or $build.javaExtension.version -ne $javaPin.version -or $build.javaExtension.sha256 -ne $javaPin.sha256) { throw 'Invalid bundled BUILD metadata.' }
    if ((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash -ne $build.launcherSha256) { throw 'Launcher does not match BUILD metadata.' }
    foreach ($kind in @('jdk', 'git', 'node', 'vscodium')) {
        $pin = $build.runtimes.$kind
        if (-not $pin -or $pin.version -notmatch '^(?:jdk-)?\d+\.\d+\.\d+' -or $pin.sha256 -notmatch '^[a-f0-9]{64}$' -or $pin.size -le 0) { throw 'Invalid bundled runtime metadata.' }
        $assetMarker = Join-Path $tools "$kind\.zero-asset.sha256"
        if ((Get-Content -LiteralPath $assetMarker -Raw).Trim() -ne $pin.sha256) { throw 'Bundled runtime marker does not match BUILD metadata.' }
    }
    if ((Get-FileHash -LiteralPath (Join-Path $tools 'java.vsix') -Algorithm SHA256).Hash -ne $build.javaExtension.sha256) { throw 'Java extension archive does not match BUILD metadata.' }
    $codiumPackage = Get-Content -LiteralPath (Join-Path $tools 'vscodium\resources\app\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($codiumPackage.version -ne $build.runtimes.vscodium.version) { throw 'Bundled VSCodium version does not match BUILD metadata.' }
    foreach ($file in @($editor, (Join-Path $tools 'vscodium\resources\app\out\cli.js'), (Join-Path $tools 'jdk\bin\java.exe'), (Join-Path $tools 'git\cmd\git.exe'), (Join-Path $tools 'node\node.exe'), (Join-Path $tools 'java.vsix'))) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Bundled tools are incomplete.' }
    }
    $report.version = $build.kitVersion; $report.sourceRevision = $build.sourceRevision; $report.kitSha256 = $build.kitSha256
    if ($SeedJavaVsix) {
        $stage = 'seed-old-java'
        if ((Get-FileHash -LiteralPath $SeedJavaVsix -Algorithm SHA256).Hash.ToLowerInvariant() -ne '80a6b852577aec37510b1f975e188279181e8c30ab5cae88812d941cd2d11bff') { throw 'Unexpected 1.57 VSIX.' }
        $cli = Join-Path $tools 'vscodium\resources\app\out\cli.js'
        $env:ELECTRON_RUN_AS_NODE = '1'
        try { $args = @($cli, '--user-data-dir', $profile, '--extensions-dir', $extensions, '--install-extension', $SeedJavaVsix, '--force') | ForEach-Object { Quote-Argument $_ }; $install = Start-Process -FilePath $editor -ArgumentList ($args -join ' ') -Wait -PassThru; if ($install.ExitCode -ne 0) { throw 'Old Java installation failed.' } } finally { Remove-Item Env:ELECTRON_RUN_AS_NODE }
        if (@(Installed-Extensions) -notcontains 'redhat.java@1.57.0') { throw 'Old Java profile was not seeded.' }
        $settings = Join-Path $profile 'User\settings.json'
        New-Item -ItemType Directory -Force (Split-Path $settings) | Out-Null
        '{"editor.fontSize": 17}' | Set-Content -LiteralPath $settings -Encoding UTF8
        $report['seedJava'] = '1.57.0'
    }
    $beforeTools = @(Tool-Inventory)
    $stage = 'cold-launch'
    $coldStarted = [DateTime]::UtcNow
    $p = Start-Process -FilePath $launcher -PassThru; $owned[$p.Id] = $p.StartTime; $p.Dispose()
    $marker = Join-Path $data 'editor-opened'
    Wait-For { (Test-Path -LiteralPath $marker) -and @(Editor-Roots).Count -gt 0 } 180 'cold editor handoff'
    $actual = @(Installed-Extensions)
    if ($actual -notcontains "zero.zero@$($build.kitVersion)" -or $actual -notcontains "redhat.java@$($javaPin.version)") { throw 'Expected exact Zero and Java extension versions were not installed.' }
    $manifests = @(Manifest-Inventory)
    if ($manifests.Count -lt 2) { throw 'Extension manifests are missing.' }
    $firstMarker = (Get-Item -LiteralPath $marker).LastWriteTimeUtc
    # Allow only this disposable profile to open our generated probe file.
    $settingsPath = Join-Path $profile 'User\settings.json'
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $settings | Add-Member -NotePropertyName 'security.workspace.trust.untrustedFiles' -NotePropertyValue 'open' -Force
    $settings | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $settingsPath -Encoding UTF8
    $stage = 'cold-java-language-server'
    Test-LanguageServer $coldStarted
    Start-Sleep -Seconds 10
    Capture-Screen cold
    if ($SeedJavaVsix) {
        $settings = Get-Content -LiteralPath (Join-Path $profile 'User\settings.json') -Raw | ConvertFrom-Json
        if ($settings.'editor.fontSize' -ne 17) { throw 'Existing profile preferences were not preserved.' }
        $report['migration'] = 'passed'
    }
    $report.cold = 'passed' 
    $stage = 'close-cold-processes'
    Stop-Owned
    Wait-For { @(Editor-Roots).Count -eq 0 } 60 'cold editor exit'
    $stage = 'warm-launch'
    $warmStarted = [DateTime]::UtcNow
    $p = Start-Process -FilePath $launcher -PassThru; $owned[$p.Id] = $p.StartTime; $p.Dispose()
    Wait-For { (Get-Item -LiteralPath $marker).LastWriteTimeUtc -gt $firstMarker -and @(Editor-Roots).Count -gt 0 } 180 'warm editor handoff'
    $actual = @(Installed-Extensions)
    if ($actual -notcontains "zero.zero@$($build.kitVersion)" -or $actual -notcontains "redhat.java@$($javaPin.version)") { throw 'Warm launch lost a required extension.' }
    $manifestChanges = @(Compare-Object $manifests @(Manifest-Inventory))
    if ($manifestChanges.Count) {
        $report['manifestChanges'] = @($manifestChanges | ForEach-Object { $_.SideIndicator + ' ' + $_.InputObject })
        $unexpected = @($manifestChanges | Where-Object { -not ($SeedJavaVsix -and $_.SideIndicator -eq '<=' -and $_.InputObject -match '^redhat\.java-1\.57\.0:') })
        if ($unexpected.Count) { throw 'Active extension manifests changed during warm launch.' }
    }
    $stage = 'warm-java-language-server'
    Test-LanguageServer $warmStarted
    Start-Sleep -Seconds 10
    Capture-Screen warm
    $toolChanges = @(Compare-Object $beforeTools @(Tool-Inventory))
    if ($toolChanges.Count) { $report['toolChanges'] = @($toolChanges | ForEach-Object { $_.SideIndicator + ' ' + $_.InputObject }); throw 'Bundled tool inventory changed during trial.' }
    $report.warm = 'passed'; $report.status = 'passed'; $stage = 'passed'
} catch {
    $message = $_.Exception.Message
    foreach ($private in @($env:USERPROFILE, $OutputDirectory, $Bundle)) { if ($private) { $message = $message.Replace($private, '<trial-path>') } }
    $report.error = $message
    Write-Warning $message
} finally {
    try { Stop-Owned } catch { Write-Warning 'Scoped cleanup failed; discard the runner.' }
    $report.stage = $stage; $report.finishedUtc = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'report.json') -Encoding UTF8
}
if ($report.status -ne 'passed') { throw "Portable smoke failed during $stage; see report.json." }
