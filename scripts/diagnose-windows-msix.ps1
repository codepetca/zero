# Diagnostic comparison only. A passing control never clears the original gate.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $Package,
    [Parameter(Mandatory)][string] $Output
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$expectedHash = '73423da90df584b6b989f3a4ac9f742160de5bf32a3e477385cb2f20ae27530d'
$packageVersion = '1.5.56.0'
$work = $null
$packagePath = $null
$outputPath = $null
$originalPassed = $false
$failure = $null
$cleanupErrors = [System.Collections.Generic.List[string]]::new()
$summary = [ordered]@{
    schema = 1; purpose = 'WACK environment / minimal-control comparison; no certification approval'
    diagnosticSourceRevision = $env:GITHUB_SHA; candidateSourceRevision = $null
    candidateRunId = '40742412970'
    candidateSha256 = $expectedHash; candidateVersion = $packageVersion
    original = 'not-run'; control = 'not-run'; controlDpi = 'not-run'
    result = 'failed'; cleanupVerified = $false
    osVersion = [Environment]::OSVersion.Version.ToString()
    runnerImage = $env:ImageOS; runnerImageVersion = $env:ImageVersion
}

function Protect-DiagnosticText([string] $Text) {
    foreach ($path in @($env:USERPROFILE, $env:RUNNER_TEMP, $env:GITHUB_WORKSPACE)) {
        if ($path) { $Text = $Text -replace [regex]::Escape($path), '[runner-path]' }
    }
    # Do not retain accidental credentials or opaque headers from native logs.
    $Text = $Text -replace '(?im)^.*(?:authorization\s*:|bearer\s+|password\s*[:=]|access[_-]?token\s*[:=]|client[_-]?secret\s*[:=]).*$', '[redacted sensitive log line]'
    return $Text
}

function Save-Json($Value, [string] $Path) {
    Protect-DiagnosticText ($Value | ConvertTo-Json -Depth 12) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Save-AppCertDiagnostics([string] $Label, [DateTime] $Since) {
    # This is the only native log directory inspected. Never search profile/cache trees.
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\AppCertKit'
    $destination = Join-Path $outputPath ($Label + '/appcert-logs')
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $metadata = [System.Collections.Generic.List[object]]::new()
    $budget = 16MB
    $count = 0
    if (Test-Path -LiteralPath $root -PathType Container) {
        $files = @(Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction Stop |
            Where-Object { $_.LastWriteTimeUtc -ge $Since.AddSeconds(-2) -and $_.Extension -in @('.log', '.txt', '.xml', '.htm', '.html', '.etl') } |
            Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 40)
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($root.Length).TrimStart('\')
            $entry = [ordered]@{ path = $relative; bytes = $file.Length; lastWriteUtc = $file.LastWriteTimeUtc.ToString('o'); retained = $false }
            # ETL is binary: retain only metadata, never opaque payloads.
            if ($file.Extension -ne '.etl' -and $file.Length -le 2MB -and $file.Length -le $budget -and $count -lt 20) {
                $count++
                $name = ('{0:D2}-{1}' -f $count, $file.Name)
                Protect-DiagnosticText (Get-Content -LiteralPath $file.FullName -Raw) | Set-Content -LiteralPath (Join-Path $destination $name) -Encoding UTF8
                $budget -= $file.Length
                $entry.retained = $true
                $entry.output = $name
            }
            $metadata.Add($entry)
        }
    }
    Save-Json ([ordered]@{ root = 'LocalAppData/Microsoft/AppCertKit'; maximumFilesInspected = 40; maximumTextFiles = 20; maximumTextBytes = 16MB; files = @($metadata) }) (Join-Path $destination 'index.json')
}

function Invoke-Validation([string] $Label, [string] $Path) {
    $directory = Join-Path $outputPath $Label
    New-Item -ItemType Directory -Path $directory | Out-Null
    $receipt = Join-Path $directory 'install-msix.json'
    $start = [DateTime]::UtcNow
    $passed = $false
    try {
        & (Join-Path $PSScriptRoot 'test-windows-msix.ps1') -Package $Path -PackageVersion $packageVersion -Receipt $receipt -RunWack | Out-Host
        $passed = $true
    } catch {
        # Do not convert a gate failure into success; capture only a sanitized message.
        Protect-DiagnosticText $_.Exception.Message | Set-Content -LiteralPath (Join-Path $directory 'validation-error.txt') -Encoding UTF8
    } finally {
        Save-AppCertDiagnostics $Label $start
        $reportHashes = [ordered]@{}
        foreach ($report in @('wack/report.xml', 'wack/report.html')) {
            $reportPath = Join-Path $directory $report
            if (Test-Path -LiteralPath $reportPath -PathType Leaf) {
                $nativeHash = (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant()
                Protect-DiagnosticText (Get-Content -LiteralPath $reportPath -Raw) | Set-Content -LiteralPath $reportPath -Encoding UTF8
                $reportHashes[$report] = [ordered]@{
                    nativeSha256 = $nativeHash
                    retainedSanitizedSha256 = (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant()
                }
            }
        }
        # Existing validation receipts describe native bytes; retain that provenance.
        Save-Json $reportHashes (Join-Path $directory 'sanitized-report-hashes.json')
    }
    if (-not (Test-Path -LiteralPath $receipt -PathType Leaf)) { throw "$Label validation produced no receipt." }
    $data = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if (-not $data.cleanupVerified) { throw "$Label validation cleanup failed; refusing further package changes." }
    return ($passed -and $data.result -eq 'passed' -and $data.wack.result -in @('passed', 'passed-with-optional-findings'))
}

try {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or
        $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or
        $env:ImageOS -ne 'win22' -or -not [Environment]::Is64BitOperatingSystem) {
        throw 'Manual workflow on a disposable GitHub-hosted windows-2022 x64 runner required.'
    }
    $packagePath = (Resolve-Path -LiteralPath $Package).ProviderPath
    if ((Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Candidate SHA-256 mismatch.' }
    $buildReceipt = Join-Path (Split-Path -Parent $packagePath) 'build-msix.json'
    if (Test-Path -LiteralPath $buildReceipt -PathType Leaf) {
        $build = Get-Content -LiteralPath $buildReceipt -Raw | ConvertFrom-Json
        if ($build.artifact.sha256 -ne $expectedHash -or $build.packageVersion -ne $packageVersion -or
            $build.sourceRevision -notmatch '^[a-fA-F0-9]{40}$' -or $build.sourceDirty -ne $false) { throw 'Candidate build receipt does not match the pinned package.' }
        $summary.candidateSourceRevision = $build.sourceRevision
    }
    $outputPath = [IO.Path]::GetFullPath($Output)
    if (Test-Path -LiteralPath $outputPath) { throw 'Diagnostic output must be new.' }
    New-Item -ItemType Directory -Path $outputPath | Out-Null
    if (Test-Path -LiteralPath $buildReceipt -PathType Leaf) {
        # Only measured provenance fields, never arbitrary downloaded receipt content.
        Save-Json ([ordered]@{ sourceRevision = $build.sourceRevision; sourceDirty = $build.sourceDirty;
            packageVersion = $build.packageVersion; candidateSha256 = $expectedHash }) (Join-Path $outputPath 'candidate-provenance.json')
    }
    $work = Join-Path $env:RUNNER_TEMP ('zero-msix-diagnostics-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $sdk = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
    $mt = Join-Path $sdk 'mt.exe'
    $makeAppx = Join-Path $sdk 'makeappx.exe'
    $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    $tools = [ordered]@{}
    foreach ($tool in @($mt, $makeAppx, $csc)) {
        if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw 'Required Windows SDK manifest/packaging tool or Framework compiler unavailable.' }
        $signature = Get-AuthenticodeSignature -LiteralPath $tool
        if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') { throw 'Diagnostic tool lacks valid Microsoft Authenticode signature.' }
        $tools[(Split-Path -Leaf $tool)] = [ordered]@{ sha256 = (Get-FileHash -LiteralPath $tool -Algorithm SHA256).Hash.ToLowerInvariant(); fileVersion = (Get-Item -LiteralPath $tool).VersionInfo.FileVersion }
    }
    Save-Json $tools (Join-Path $outputPath 'tools.json')
    $payload = Join-Path $work 'payload'
    & $makeAppx unpack /p $packagePath /d $payload /nv
    if ($LASTEXITCODE -ne 0) { throw 'Candidate unpack failed.' }
    $exe = Join-Path $payload 'Zero.exe'
    & $mt "-inputresource:$exe;#1" "-out:$(Join-Path $outputPath 'original-win32.manifest')"
    if ($LASTEXITCODE -ne 0) { throw 'Original executable manifest extraction failed.' }
    & $mt -manifest (Join-Path $outputPath 'original-win32.manifest') -validate_manifest
    if ($LASTEXITCODE -ne 0) { throw 'Original executable manifest validation failed.' }
    Copy-Item -LiteralPath (Join-Path $payload 'AppxManifest.xml') -Destination (Join-Path $outputPath 'original-appx-manifest.xml')
    $originalPassed = Invoke-Validation 'original' $packagePath
    $summary.original = if ($originalPassed) { 'passed' } else { 'failed' }

    # The control changes only Zero.exe; all candidate payload/config/identity remain.
    $source = Join-Path $work 'Control.cs'
    @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
internal static class ControlProgram {
    [DllImport("user32.dll")] static extern IntPtr GetWindowDpiAwarenessContext(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool AreDpiAwarenessContextsEqual(IntPtr a, IntPtr b);
    [STAThread] static void Main(string[] args) {
        Application.EnableVisualStyles();
        using (var form = new Form { Text = "WACK diagnostic control", Width = 360, Height = 140 })
        using (var timer = new Timer { Interval = 2000 }) {
            form.Shown += delegate {
                if (args.Length == 2 && args[0] == "/probe") {
                    bool pmv2 = AreDpiAwarenessContextsEqual(GetWindowDpiAwarenessContext(form.Handle), new IntPtr(-4));
                    File.WriteAllText(args[1], pmv2 ? "PerMonitorV2" : "Unexpected DPI context");
                }
                timer.Start();
            };
            timer.Tick += delegate { form.Close(); };
            Application.Run(form);
        }
    }
}
'@ | Set-Content -LiteralPath $source -Encoding UTF8
    $manifest = Join-Path $PSScriptRoot '../native-installer/windows/app.manifest'
    Copy-Item -LiteralPath $manifest -Destination (Join-Path $outputPath 'control-source.manifest')
    & $csc /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/win32manifest:$manifest" "/out:$exe" $source
    if ($LASTEXITCODE -ne 0) { throw 'Minimal control compilation failed.' }
    & $mt "-inputresource:$exe;#1" "-out:$(Join-Path $outputPath 'control-win32.manifest')"
    if ($LASTEXITCODE -ne 0) { throw 'Control manifest extraction failed.' }
    & $mt -manifest (Join-Path $outputPath 'control-win32.manifest') -validate_manifest
    if ($LASTEXITCODE -ne 0) { throw 'Control manifest validation failed.' }
    $probePath = Join-Path $work 'control-dpi.txt'
    $process = Start-Process -FilePath $exe -ArgumentList @('/probe', ('"' + $probePath + '"')) -PassThru
    try {
        if (-not $process.WaitForExit(10000)) {
            & taskkill.exe /PID $process.Id /T /F | Out-Null
            throw 'Control DPI probe timed out.'
        }
        $process.Refresh()
        if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $probePath -PathType Leaf)) { throw 'Control DPI probe failed.' }
        $summary.controlDpi = (Get-Content -LiteralPath $probePath -Raw).Trim()
        if ($summary.controlDpi -ne 'PerMonitorV2') { throw 'Control HWND did not prove PerMonitorV2.' }
    } finally { $process.Dispose() }
    # MakeAppx regenerates packaging metadata. Never reuse the original block map.
    foreach ($name in @('AppxBlockMap.xml', '[Content_Types].xml', 'AppxSignature.p7x')) {
        $path = Join-Path $payload $name
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    $controlPackage = Join-Path $work 'control-only.msix'
    & $makeAppx pack /d $payload /p $controlPackage
    if ($LASTEXITCODE -ne 0) { throw 'Control-only package creation failed.' }
    $summary.controlExeSha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    $summary.controlPackageSha256 = (Get-FileHash -LiteralPath $controlPackage -Algorithm SHA256).Hash.ToLowerInvariant()
    $controlPassed = Invoke-Validation 'control' $controlPackage
    $summary.control = if ($controlPassed) { 'passed' } else { 'failed' }
} catch {
    $failure = $_
    $summary.error = Protect-DiagnosticText $_.Exception.Message
} finally {
    if ($work) {
        try { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction Stop }
        catch { $cleanupErrors.Add('diagnostic temporary files') }
    }
    if ($packagePath) {
        try { if ((Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Candidate changed.' } }
        catch { $cleanupErrors.Add('original candidate integrity') }
    }
    $summary.cleanupVerified = ($cleanupErrors.Count -eq 0)
    $summary.cleanupErrors = @($cleanupErrors)
    if (-not $failure -and $originalPassed -and $summary.cleanupVerified) { $summary.result = 'passed' }
    if ($outputPath -and (Test-Path -LiteralPath $outputPath -PathType Container)) { Save-Json $summary (Join-Path $outputPath 'diagnostic-summary.json') }
}
if ($failure) { throw ('MSIX diagnostics incomplete: ' + (Protect-DiagnosticText $failure.Exception.Message)) }
if ($cleanupErrors.Count -ne 0) { throw 'MSIX diagnostic cleanup or candidate integrity failed.' }
if (-not $originalPassed) { throw 'Original candidate validation failed. A control result does not clear its gate; inspect retained reports.' }
