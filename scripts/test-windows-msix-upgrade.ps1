# In-place deployment and launcher proof on a clean, disposable Windows runner.
# Both immutable unsigned candidates are copied and signed with ONE temporary cert.
# This proves a local MSIX upgrade, never Microsoft Store signing or delivery.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OldPackage,
    [Parameter(Mandatory)][string]$OldBuildReceipt,
    [Parameter(Mandatory)][string]$NewPackage,
    [Parameter(Mandatory)][string]$NewBuildReceipt,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedNewSourceRevision,
    [Parameter(Mandatory)][ValidatePattern('^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$')][string]$ExpectedNewKitVersion,
    [Parameter(Mandatory)][ValidatePattern('^[1-9][0-9]*\.[0-9]+\.[0-9]+\.0$')][string]$ExpectedNewPackageVersion,
    [Parameter(Mandatory)][string]$Receipt,
    [string]$FirstRunScript = (Join-Path $PSScriptRoot 'test-msix-first-run.ps1'),
    [ValidateRange(120,1200)][int]$TimeoutSeconds = 600
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = 'Codepet.zerostudio'
$publisher = 'CN=DC9AEBC0-4CAE-4681-9E52-20B0B1C14919'
$family = 'Codepet.zerostudio_g62pw1js6rhjp'
$oldHash = '94c5d45ebf44ba6f3d3f5abe3f5c6a2dd7ea33a3f1a3e8a6710054226676cf22'
$oldSource = 'f74ed9ce63b594fff61a70249b445d6516fe7e7f'
$signTool = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe'
$stage = 'preflight'
$certificate = $null
$temporary = $null
$preflightClean = $false
$installAttempted = $false
$failure = $null
$cleanupErrors = [Collections.Generic.List[string]]::new()
$candidates = @()
$data = $null
$packageRoots = [Collections.Generic.List[string]]::new()
$logicalData = Join-Path $env:LOCALAPPDATA 'ZeroStudioStoreData'
$redirectedData = Join-Path $env:LOCALAPPDATA ('Packages\' + $family + '\LocalCache\Local\ZeroStudioStoreData')
$dataRoots = @($logicalData, $redirectedData)
$project = Join-Path $env:USERPROFILE 'Zero Studio'
$report = [ordered]@{
    schema = 1; result = 'failed'; stage = $stage; errorHResult = $null
    kind = 'same-certificate-local-msix-upgrade'; identity = $identity; family = $family
    oldRunId = '41134687731'; oldRunAttempt = '1'; oldSourceRevision = $oldSource
    newSourceRevision = $ExpectedNewSourceRevision
    oldVersion = '1.5.58.0'; newVersion = $ExpectedNewPackageVersion
    oldCandidateSha256 = $null; newCandidateSha256 = $null
    oldSignedCopySha256 = $null; newSignedCopySha256 = $null
    signingThumbprint = $null; oldPackageFullName = $null; newPackageFullName = $null
    oldInstallVerified = $false; oldActivationVerified = $false
    newInstallVerified = $false; newActivationVerified = $false
    preservedBeforeActivation = $false; preservedAfterActivation = $false
    privateJavaVerified = $false; zeroExtensionVersion = $null; newKitVersion = $null
    consentPromptOnReopen = $false; newEditorObserved = $false; newEditorWindowVerified = $false
    extensionEvidence = 'Installed extension package.json version only; extension-host activation and complete extension-content equality are unverified.'
    stateSha256 = [ordered]@{}; cleanupVerified = $false
    trustScope = 'Temporary public certificate in LocalMachine/TrustedPeople; key only in CurrentUser/My'
    limits = @('Original unsigned candidates are unchanged; signed copies use one ephemeral certificate.',
        'Local Windows Server 2022 x64 MSIX upgrade; does not establish Store signing, certification, licensing, download delivery, Windows desktop or school-device acceptance.',
        'Verifies a fresh isolated editor GUI window and extension manifest version, not extension-host activation, interactive editor commands or a student game.',
        'Cleanup covers package, owned processes, certificate and temporary copies; residual disposable user project/profile state is left to runner disposal.')
}
function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Check-Candidate([string]$Path, [string]$BuildPath, [string]$KitVersion, [string]$Version, [string]$Source) {
    $resolved = (Resolve-Path -LiteralPath $Path).ProviderPath
    $build = Get-Content -LiteralPath $BuildPath -Raw | ConvertFrom-Json
    $hash = Hash $resolved
    if ($build.kind -ne 'msix-store' -or $build.sourceDirty -ne $false -or $build.unsigned -ne $true -or
        $build.sourceRevision -ne $Source -or $build.kitVersion -ne $KitVersion -or $build.packageVersion -ne $Version -or
        $build.identity.name -ne $identity -or $build.identity.publisher -ne $publisher -or
        $build.identity.packageFamilyName -ne $family -or $build.artifact.filename -ne (Split-Path $resolved -Leaf) -or
        $build.artifact.sha256 -ne $hash -or $build.artifact.size -ne (Get-Item -LiteralPath $resolved).Length) {
        throw 'Candidate differs from its clean source-bound build receipt.'
    }
    $archive = [IO.Compression.ZipFile]::OpenRead($resolved)
    try {
        if ($archive.GetEntry('AppxSignature.p7x')) { throw 'Original candidate must remain unsigned.' }
        $manifestEntry = $archive.GetEntry('AppxManifest.xml')
        if (-not $manifestEntry) { throw 'Candidate has no manifest.' }
        $reader = [IO.StreamReader]::new($manifestEntry.Open())
        try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $manifestIdentity = $manifest.Package.Identity
        if ($manifestIdentity.Name -ne $identity -or $manifestIdentity.Publisher -ne $publisher -or
            $manifestIdentity.Version -ne $Version -or $manifestIdentity.ProcessorArchitecture -ne 'x64' -or
            $manifest.Package.Applications.Application.Id -ne 'Zero') { throw 'Candidate manifest identity mismatch.' }
        $payload = [ordered]@{}
        foreach ($file in $build.artifact.files) {
            if ($file.name -notmatch '^(Zero\.exe|Zero\.exe\.config|Newtonsoft\.Json\.dll|AppxManifest\.xml|Assets/(StoreLogo|Square44x44Logo|Square150x150Logo)\.png)$' -or $payload.Contains($file.name)) { throw 'Unexpected or duplicate candidate payload.' }
            $entry = $archive.GetEntry($file.name)
            if (-not $entry -or $entry.Length -ne $file.size) { throw 'Candidate payload missing or wrong size.' }
            $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
            try { $measured = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
            finally { $sha.Dispose(); $stream.Dispose() }
            if ($measured -ne $file.sha256) { throw 'Candidate payload hash differs from build receipt.' }
            $payload[$file.name] = $measured
        }
        if (-not $payload.Contains('Zero.exe') -or -not $payload.Contains('AppxManifest.xml')) { throw 'Required payload not measured.' }
        return [pscustomobject]@{ Path = $resolved; Hash = $hash; Version = $Version; Payload = $payload }
    } finally { $archive.Dispose() }
}
function Check-Installed($Candidate) {
    $packages = @(Get-AppxPackage -Name $identity)
    if ($packages.Count -ne 1) { throw 'Expected exactly one registered package.' }
    $installed = $packages[0]
    if ($installed.Name -ne $identity -or $installed.Publisher -ne $publisher -or
        $installed.PackageFamilyName -ne $family -or $installed.Version.ToString() -ne $Candidate.Version -or
        $installed.Architecture.ToString() -ne 'X64' -or $installed.SignatureKind.ToString() -ne 'Developer' -or
        $installed.Status.ToString() -ne 'Ok') { throw 'Installed identity, version, architecture, status or signature kind mismatch.' }
    foreach ($name in $Candidate.Payload.Keys) {
        if ((Hash (Join-Path $installed.InstallLocation $name)) -ne $Candidate.Payload[$name]) { throw 'Installed payload differs from immutable candidate.' }
    }
    return $installed
}
function Owned-Processes {
    @(Get-CimInstance Win32_Process | Where-Object {
        $owned = $false
        if ($_.ExecutablePath) {
            foreach ($root in @($dataRoots) + @($packageRoots)) {
                if ($_.ExecutablePath.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { $owned = $true }
            }
        }
        if ($_.Name -eq 'Code.exe' -and $_.CommandLine) {
            foreach ($root in $dataRoots) {
                if ($_.CommandLine.IndexOf((Join-Path $root 'editor\user-data'), [StringComparison]::OrdinalIgnoreCase) -ge 0) { $owned = $true }
            }
        }
        $owned
    })
}
function Close-OwnedProcesses {
    $processes = @(Owned-Processes)
    foreach ($item in $processes) {
        $process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
        if ($process -and $process.MainWindowHandle -ne [IntPtr]::Zero) { [void]$process.CloseMainWindow() }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while (@(Owned-Processes).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
    # Scope is exact package/private runtime executable roots or exact isolated profile.
    foreach ($item in @(Owned-Processes)) { Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while (@(Owned-Processes).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (@(Owned-Processes).Count -gt 0) { throw 'Owned editor/launcher processes did not stop.' }
}
function Check-Preserved($Expected) {
    foreach ($path in $Expected.Keys) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Hash $path) -ne $Expected[$path]) { throw 'Student or package state changed across upgrade.' }
    }
    $settings = Get-Content -LiteralPath (Join-Path $data 'editor\user-data\User\settings.json') -Raw | ConvertFrom-Json
    if ($settings.'editor.fontSize' -ne 17) { throw 'Student editor preference was lost.' }
}
try {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
        $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ARCH -ne 'X64' -or $env:ImageOS -ne 'win22' -or
        -not [Environment]::Is64BitOperatingSystem) { throw 'Disposable GitHub-hosted windows-2022 x64 runner required.' }
    $receiptPath = [IO.Path]::GetFullPath($Receipt)
    if (Test-Path -LiteralPath $receiptPath) { throw 'Receipt must be a new file.' }
    if (-not (Test-Path -LiteralPath (Split-Path -Parent $receiptPath) -PathType Container)) { throw 'Receipt parent must exist.' }
    if (-not (Test-Path -LiteralPath $FirstRunScript -PathType Leaf)) { throw 'Reviewed Store first-run harness required.' }
    if (@(Get-AppxPackage -AllUsers -Name $identity).Count -ne 0) { throw 'Never remove or replace a preexisting installation.' }
    foreach ($path in @($dataRoots) + @($project)) { if (Test-Path -LiteralPath $path) { throw 'Clean Store account state required.' } }
    foreach ($storePath in @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\TrustedPeople')) {
        if (@(Get-ChildItem -Path $storePath | Where-Object { $_.Subject -eq $publisher }).Count -ne 0) { throw 'Publisher certificate already exists.' }
    }
    if (-not (Test-Path -LiteralPath $signTool -PathType Leaf)) { throw 'Pinned SDK SignTool missing.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $signTool
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') { throw 'SignTool must have valid Microsoft Authenticode.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $old = Check-Candidate $OldPackage $OldBuildReceipt '0.5.58' '1.5.58.0' $oldSource
    $new = Check-Candidate $NewPackage $NewBuildReceipt $ExpectedNewKitVersion $ExpectedNewPackageVersion $ExpectedNewSourceRevision
    if ([version]$new.Version -le [version]$old.Version) { throw 'New package must advance the pinned previous version.' }
    $candidates = @($old, $new)
    if ($old.Hash -ne $oldHash -or $old.Path -eq $new.Path -or $receiptPath -in @($old.Path, $new.Path)) { throw 'Pinned old candidate or distinct path check failed.' }
    $report.oldCandidateSha256 = $old.Hash; $report.newCandidateSha256 = $new.Hash
    $report['runnerImageVersion'] = $env:ImageVersion
    $preflightClean = $true
    $stage = 'signing'
    $temporary = Join-Path $env:RUNNER_TEMP ('zero-msix-upgrade-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temporary | Out-Null
    $certificate = New-SelfSignedCertificate -Type Custom -Subject $publisher -CertStoreLocation 'Cert:\CurrentUser\My' -KeyUsage DigitalSignature -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}') -FriendlyName ('Zero upgrade test ' + [guid]::NewGuid().ToString('N')) -NotAfter (Get-Date).AddDays(1)
    $report.signingThumbprint = $certificate.Thumbprint
    $trust = [Security.Cryptography.X509Certificates.X509Store]::new('TrustedPeople', 'LocalMachine')
    try { $trust.Open('ReadWrite'); $publicCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate.RawData); $trust.Add($publicCertificate) } finally { $trust.Close() }
    $oldCopy = Join-Path $temporary 'old.msix'; $newCopy = Join-Path $temporary 'new.msix'
    Copy-Item -LiteralPath $old.Path -Destination $oldCopy; Copy-Item -LiteralPath $new.Path -Destination $newCopy
    foreach ($copy in @($oldCopy, $newCopy)) {
        & $signTool sign /fd SHA256 /sha1 $certificate.Thumbprint $copy
        if ($LASTEXITCODE -ne 0) { throw 'Temporary copy signing failed.' }
        & $signTool verify /pa $copy
        if ($LASTEXITCODE -ne 0) { throw 'Signed copy signature validation failed.' }
    }
    $report.oldSignedCopySha256 = Hash $oldCopy; $report.newSignedCopySha256 = Hash $newCopy
    $stage = 'old-install'; $installAttempted = $true
    Add-AppxPackage -Path $oldCopy -ErrorAction Stop
    $installedOld = Check-Installed $old
    $packageRoots.Add($installedOld.InstallLocation)
    $report.oldPackageFullName = $installedOld.PackageFullName; $report.oldInstallVerified = $true
    $stage = 'old-activation'
    & $FirstRunScript -PackageFamily $family -KitVersion '0.5.58' -TimeoutSeconds $TimeoutSeconds
    $report.oldActivationVerified = $true
    $found = @($dataRoots | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'editor-opened') -PathType Leaf })
    if ($found.Count -ne 1) { throw 'Expected exactly one actual package data directory.' }
    $data = $found[0]
    Close-OwnedProcesses
    $stage = 'seed-state'
    $main = Join-Path $project 'starter\src\main\java\Main.java'
    if (-not (Test-Path -LiteralPath $main -PathType Leaf)) { throw 'Actual starter source not found.' }
    $nonce = [guid]::NewGuid().ToString('N')
    [IO.File]::AppendAllText($main, "`r`n// Student edit retained across MSIX upgrade: $nonce`r`n", [Text.UTF8Encoding]::new($false))
    $save = Join-Path $project 'starter\upgrade-save.json'
    $asset = Join-Path $project 'starter\src\main\resources\upgrade-asset.txt'
    $sentinel = Join-Path $data 'upgrade-proof.txt'
    foreach ($path in @($save, $asset, $sentinel)) {
        if (Test-Path -LiteralPath $path) { throw 'Proof file unexpectedly exists.' }
        $parent = Split-Path -Parent $path
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        [IO.File]::WriteAllText($path, $nonce, [Text.UTF8Encoding]::new($false))
    }
    $settingsPath = Join-Path $data 'editor\user-data\User\settings.json'
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $settings | Add-Member -NotePropertyName 'editor.fontSize' -NotePropertyValue 17 -Force
    [IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
    $preserved = [ordered]@{}
    foreach ($path in @($main, $save, $asset, $sentinel, (Join-Path $data 'dependency-consent-v1'), (Join-Path $data 'editor-opened'))) { $preserved[$path] = Hash $path }
    foreach ($path in $preserved.Keys) {
        $label = $path.Replace($data, '<package-data>').Replace($project, '<student-kit>')
        $report.stateSha256[$label] = $preserved[$path]
    }
    $stage = 'upgrade'
    # Deliberately no Remove-AppxPackage, profile reset, -ForceUpdateFromAnyVersion,
    # or -Update (the latter flags a dependency package, not a primary app update).
    Add-AppxPackage -Path $newCopy -ErrorAction Stop
    $installedNew = Check-Installed $new
    $packageRoots.Add($installedNew.InstallLocation)
    if ($installedNew.PackageFullName -eq $installedOld.PackageFullName -or $installedNew.PackageFamilyName -ne $installedOld.PackageFamilyName) { throw 'Upgrade did not replace the registered version within the same family.' }
    $report.newPackageFullName = $installedNew.PackageFullName; $report.newInstallVerified = $true
    Check-Preserved $preserved; $report.preservedBeforeActivation = $true
    $stage = 'new-activation'
    # First-run harness loaded the real COM activation helper. Never execute the
    # installed Zero.exe directly: activate its newly registered package identity.
    $started = [DateTime]::UtcNow
    $activatedPid = [ZeroActivation]::Launch("${family}!Zero")
    if (-not $activatedPid) { throw 'New packaged activation returned no process ID.' }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $ready = $false
    $editorWindowPid = $null
    $editorWindowHandle = [IntPtr]::Zero
    $editorWindowSince = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($window in $windows) {
            if ($window.Current.ProcessId -ne $activatedPid) { continue }
            $names = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name })
            if (@($names | Where-Object { $_ -like 'Zero needs to download Java*' }).Count -gt 0) {
                $report.consentPromptOnReopen = $true; throw 'Upgrade lost prior dependency consent.'
            }
        }
        $editor = @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object {
            $_.CommandLine -and $_.CommandLine.IndexOf((Join-Path $data 'editor\user-data'), [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CreationDate.ToUniversalTime() -ge $started
        })
        $extensionRoot = Join-Path $data 'editor\extensions'
        $versions = @()
        if (Test-Path -LiteralPath $extensionRoot) {
            foreach ($directory in @(Get-ChildItem -LiteralPath $extensionRoot -Directory)) {
                $manifestPath = Join-Path $directory.FullName 'package.json'
                if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
                    $extension = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
                    if ($extension.publisher -eq 'zero' -and $extension.name -eq 'zero') { $versions += $extension.version }
                }
            }
        }
        # A CLI Electron process can share Code.exe/profile arguments. Require
        # an actual visible top-level GUI window, with the same process/handle
        # persisting for at least three seconds after package activation.
        $gui = @($editor | Where-Object {
            $candidatePid = $_.ProcessId
            $process = Get-Process -Id $candidatePid -ErrorAction SilentlyContinue
            if (-not $process -or $process.MainWindowHandle -eq [IntPtr]::Zero -or [string]::IsNullOrWhiteSpace($process.MainWindowTitle)) { return $false }
            @($windows | Where-Object {
                $_.Current.ProcessId -eq $candidatePid -and $_.Current.NativeWindowHandle -eq $process.MainWindowHandle.ToInt64() -and
                -not $_.Current.IsOffscreen -and -not [string]::IsNullOrWhiteSpace($_.Current.Name)
            }).Count -gt 0
        })
        if ($gui.Count -gt 0) {
            $guiProcess = Get-Process -Id $gui[0].ProcessId -ErrorAction SilentlyContinue
            if ($guiProcess -and $guiProcess.MainWindowHandle -ne [IntPtr]::Zero) {
                if ($editorWindowPid -ne $guiProcess.Id -or $editorWindowHandle -ne $guiProcess.MainWindowHandle) {
                    $editorWindowPid = $guiProcess.Id; $editorWindowHandle = $guiProcess.MainWindowHandle; $editorWindowSince = [DateTime]::UtcNow
                }
            } else { $editorWindowSince = $null }
        } else { $editorWindowSince = $null; $editorWindowPid = $null; $editorWindowHandle = [IntPtr]::Zero }
        $kitMetadata = Get-Content -LiteralPath (Join-Path $project 'setup\kit.properties') -Raw
        if ($editorWindowSince -and ([DateTime]::UtcNow - $editorWindowSince).TotalSeconds -ge 3 -and
            $ExpectedNewKitVersion -in $versions -and $kitMetadata -match ('(?m)^kitVersion=' + [regex]::Escape($ExpectedNewKitVersion) + '\r?$')) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'New activation did not open the isolated editor with the current extension and kit.' }
    $report.newEditorObserved = $true; $report.newEditorWindowVerified = $true
    $report.zeroExtensionVersion = $ExpectedNewKitVersion; $report.newKitVersion = $ExpectedNewKitVersion
    $stage = 'private-java'
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $runtimes = @($settings.'java.configuration.runtimes' | Where-Object { $_.name -eq 'JavaSE-21' -and $_.default -eq $true })
    if ($runtimes.Count -ne 1) { throw 'Expected one default private Java 21 runtime.' }
    $java = [IO.Path]::GetFullPath($runtimes[0].path)
    if (-not $java.StartsWith((Join-Path $data 'runtime\jdk-'), [StringComparison]::OrdinalIgnoreCase)) { throw 'New editor Java is outside the actual private package data directory.' }
    foreach ($exe in @('java.exe', 'javac.exe')) {
        $process = Start-Process -FilePath (Join-Path $java ('bin\' + $exe)) -ArgumentList '-version' -PassThru -WindowStyle Hidden
        try {
            if (-not $process.WaitForExit(30000)) { $process.Kill(); throw 'Private Java command timed out.' }
            if ($process.ExitCode -ne 0) { throw 'Private Java command failed.' }
        } finally { $process.Dispose() }
    }
    $report.privateJavaVerified = $true
    Check-Preserved $preserved; $report.preservedAfterActivation = $true
    $report.newActivationVerified = $true
} catch {
    $failure = $_
    $report.stage = $stage
    $report.errorHResult = ('0x{0:X8}' -f ([uint32]([int64]$_.Exception.HResult -band 4294967295L)))
    $reason = $_.Exception.Message
    foreach ($redaction in @(@($env:USERPROFILE, '<user>'), @($env:GITHUB_WORKSPACE, '<workspace>'), @($env:RUNNER_TEMP, '<temp>'))) {
        if ($redaction[0]) { $reason = $reason.Replace($redaction[0], $redaction[1]) }
    }
    $report['failureReason'] = $reason.Substring(0, [Math]::Min($reason.Length, 500))
} finally {
    if ($preflightClean -and $installAttempted) {
        try { Close-OwnedProcesses } catch { $cleanupErrors.Add('owned processes') }
        try {
            foreach ($package in @(Get-AppxPackage -Name $identity)) {
                if ($package.Publisher -ne $publisher -or $package.PackageFamilyName -ne $family -or $package.Version.ToString() -notin @('1.5.58.0', $ExpectedNewPackageVersion)) { throw 'Unexpected package during cleanup.' }
                Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop
            }
            if (@(Get-AppxPackage -Name $identity).Count -ne 0) { throw 'Package remains.' }
        } catch { $cleanupErrors.Add('package') }
    }
    if ($certificate) {
        foreach ($storePath in @('Cert:\LocalMachine\TrustedPeople', 'Cert:\CurrentUser\My')) {
            try {
                $certPath = Join-Path $storePath $certificate.Thumbprint
                if (Test-Path -LiteralPath $certPath) {
                    if ($storePath -eq 'Cert:\CurrentUser\My') { Remove-Item -LiteralPath $certPath -DeleteKey -ErrorAction Stop }
                    else { Remove-Item -LiteralPath $certPath -ErrorAction Stop }
                }
                if (Test-Path -LiteralPath $certPath) { throw 'Certificate remains.' }
            } catch { $cleanupErrors.Add('certificate') }
        }
    }
    if ($temporary) { try { Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction Stop } catch { $cleanupErrors.Add('temporary copies') } }
    foreach ($candidate in $candidates) { try { if ((Hash $candidate.Path) -ne $candidate.Hash) { throw 'Candidate changed.' } } catch { $cleanupErrors.Add('candidate integrity') } }
    $report.cleanupVerified = ($cleanupErrors.Count -eq 0)
    if ($cleanupErrors.Count -ne 0) { $report['cleanupErrors'] = @($cleanupErrors) }
    if (-not $failure -and $report.newActivationVerified -and $report.cleanupVerified) { $report.result = 'passed'; $report.stage = 'complete' }
    if (Get-Variable -Name receiptPath -ErrorAction SilentlyContinue) {
        $json = $report | ConvertTo-Json -Depth 8
        $file = [IO.File]::Open($receiptPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $writer = [IO.StreamWriter]::new($file, [Text.UTF8Encoding]::new($false)); try { $writer.WriteLine($json) } finally { $writer.Dispose() } }
        finally { $file.Dispose() }
    }
}
if ($failure) { throw ('MSIX upgrade failed at ' + $report.stage + '; ' + $report.errorHResult + '. See sanitized receipt.') }
if ($cleanupErrors.Count -ne 0) { throw ('MSIX upgrade cleanup failed: ' + ($cleanupErrors -join ', ')) }
