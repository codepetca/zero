# Real package deployment check, exclusively on a disposable hosted Windows runner.
# A temporary public certificate is trusted only for this disposable runner. No policy changes.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $Package,
    [Parameter(Mandatory)][string] $PackageVersion,
    [Parameter(Mandatory)][string] $Receipt
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = 'Codepet.zerostudio'
$publisher = 'CN=DC9AEBC0-4CAE-4681-9E52-20B0B1C14919'
$family = 'Codepet.zerostudio_g62pw1js6rhjp'
$signTool = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe'
$stage = 'preflight'
$originalHash = $null
$signedHash = $null
$installedHash = $null
$expectedHash = $null
$payloadHashes = [ordered]@{}
$packageFullName = $null
$certificate = $null
$tempDir = $null
$installAttempted = $false
$preflightClean = $false
$failure = $null
$cleanupErrors = [System.Collections.Generic.List[string]]::new()
$receiptData = [ordered]@{
    schema = 1; result = 'failed'; stage = $stage; errorHResult = $null
    identity = $identity; publisher = $publisher; family = $family; version = $PackageVersion
    candidateSha256 = $null; signedCopySha256 = $null; candidateExecutableSha256 = $null
    installedExecutableSha256 = $null; payloadSha256 = $null; packageFullName = $null
    installAttempted = $false; installVerified = $false; cleanupVerified = $false
    trustScope = 'LocalMachine/TrustedPeople, temporary public certificate'; signingKeyScope = 'CurrentUser/My only'
    activation = 'not attempted'; activationReason = 'No unattended consent or tool acquisition is authorized.'
    limits = @('Self-signed temporary copy; original unsigned candidate is unchanged.',
        'Temporary test trust affects the disposable machine until cleanup.',
        'Does not establish Store signing, certification, update, setup, or interactive acceptance.')
}
try {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
        $env:RUNNER_OS -ne 'Windows' -or $env:ImageOS -ne 'win22' -or
        -not [Environment]::Is64BitOperatingSystem) { throw 'Disposable GitHub-hosted windows-2022 x64 runner required.' }
    if ($PackageVersion -notmatch '^[1-9][0-9]{0,4}\.[0-9]{1,5}\.[0-9]{1,5}\.0$') { throw 'Invalid expected Store version.' }
    $parsedVersion = [version]$PackageVersion
    if ($parsedVersion.Major -gt 65535 -or $parsedVersion.Minor -gt 65535 -or $parsedVersion.Build -gt 65535) { throw 'Version component exceeds MSIX limit.' }
    $packagePath = (Resolve-Path -LiteralPath $Package).ProviderPath
    $receiptPath = [IO.Path]::GetFullPath($Receipt)
    if ($packagePath -eq $receiptPath -or (Test-Path -LiteralPath $receiptPath)) { throw 'Receipt must be a new file distinct from the package.' }
    if (-not (Test-Path -LiteralPath (Split-Path -Parent $receiptPath) -PathType Container)) { throw 'Receipt parent must exist.' }
    $originalHash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $receiptData.candidateSha256 = $originalHash
    if (-not (Test-Path -LiteralPath $signTool -PathType Leaf)) { throw 'Pinned Windows SDK SignTool missing.' }
    $sig = Get-AuthenticodeSignature -LiteralPath $signTool
    if ($sig.Status -ne 'Valid' -or -not $sig.SignerCertificate -or $sig.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') { throw 'SignTool signature is not valid Microsoft Authenticode.' }
    # Refuse any already installed identity, even for another user. Never remove preexisting state.
    if (@(Get-AppxPackage -AllUsers -Name $identity).Count -ne 0) { throw 'Package identity already exists on the runner.' }
    foreach ($storePath in @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\TrustedPeople')) {
        if (@(Get-ChildItem -Path $storePath | Where-Object { $_.Subject -eq $publisher }).Count -ne 0) { throw 'A certificate with the package publisher already exists in a target store.' }
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($packagePath)
    try {
        if ($archive.GetEntry('AppxSignature.p7x')) { throw 'Candidate must be unsigned.' }
        foreach ($name in @('Zero.exe', 'Zero.exe.config', 'Newtonsoft.Json.dll', 'Assets/StoreLogo.png', 'Assets/Square44x44Logo.png', 'Assets/Square150x150Logo.png')) {
            $entry = $archive.GetEntry($name)
            if (-not $entry) {
                if ($name -in @('Zero.exe.config', 'Newtonsoft.Json.dll')) { continue }
                throw 'Required candidate payload missing.'
            }
            $stream = $entry.Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $payloadHashes[$name] = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
            finally { $sha.Dispose(); $stream.Dispose() }
        }
        $expectedHash = $payloadHashes['Zero.exe']
    } finally { $archive.Dispose() }
    $receiptData.candidateExecutableSha256 = $expectedHash
    $receiptData.payloadSha256 = $payloadHashes
    $preflightClean = $true
    $stage = 'signing'
    $tempDir = Join-Path $env:RUNNER_TEMP ('zero-msix-test-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempDir -ErrorAction Stop | Out-Null
    $copy = Join-Path $tempDir 'candidate.msix'
    Copy-Item -LiteralPath $packagePath -Destination $copy
    $certificate = New-SelfSignedCertificate -Type Custom -Subject $publisher -CertStoreLocation 'Cert:\CurrentUser\My' -KeyUsage DigitalSignature -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}') -FriendlyName ('Zero MSIX test ' + [guid]::NewGuid().ToString('N')) -NotAfter (Get-Date).AddDays(1)
    $trust = [Security.Cryptography.X509Certificates.X509Store]::new('TrustedPeople', 'LocalMachine')
    try { $trust.Open('ReadWrite'); $publicCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate.RawData); $trust.Add($publicCertificate) } finally { $trust.Close() }
    & $signTool sign /fd SHA256 /sha1 $certificate.Thumbprint $copy
    if ($LASTEXITCODE -ne 0) { throw 'SignTool failed.' }
    $signedHash = (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash.ToLowerInvariant()
    $receiptData.signedCopySha256 = $signedHash
    $stage = 'install'
    $installAttempted = $true
    $receiptData.installAttempted = $true
    Add-AppxPackage -Path $copy -ErrorAction Stop
    $stage = 'verification'
    $packages = @(Get-AppxPackage -Name $identity)
    if ($packages.Count -ne 1) { throw 'Expected exactly one installed package.' }
    $installed = $packages[0]
    if ($installed.Name -ne $identity -or $installed.Publisher -ne $publisher -or
        $installed.PackageFamilyName -ne $family -or $installed.Version.ToString() -ne $PackageVersion -or
        $installed.Architecture.ToString() -ne 'X64') { throw 'Installed package identity, family, version or architecture mismatch.' }
    $packageFullName = $installed.PackageFullName
    $receiptData.packageFullName = $packageFullName
    $installedExe = Join-Path $installed.InstallLocation 'Zero.exe'
    $installedHash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash.ToLowerInvariant()
    $receiptData.installedExecutableSha256 = $installedHash
    foreach ($name in $payloadHashes.Keys) {
        $actual = (Get-FileHash -LiteralPath (Join-Path $installed.InstallLocation $name) -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $payloadHashes[$name]) { throw 'Installed payload differs from the unsigned candidate.' }
    }
    $receiptData.installVerified = $true
} catch {
    $failure = $_
    $receiptData.stage = $stage
    $receiptData.errorHResult = ('0x{0:X8}' -f ([uint32]([int64]$_.Exception.HResult -band 4294967295L)))
} finally {
    if ($preflightClean -and $installAttempted) {
        try {
            foreach ($pkg in @(Get-AppxPackage -Name $identity)) {
                if ($pkg.Name -ne $identity -or $pkg.Publisher -ne $publisher -or $pkg.PackageFamilyName -ne $family -or $pkg.Version.ToString() -ne $PackageVersion -or $pkg.Architecture.ToString() -ne 'X64') { throw 'Unexpected package identity during cleanup.' }
                Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction Stop
            }
            if (@(Get-AppxPackage -Name $identity).Count -ne 0) { throw 'Package remains after cleanup.' }
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
    if ($tempDir) { try { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction Stop } catch { $cleanupErrors.Add('temporary files') } }
    if ($originalHash) {
        try { if ((Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $originalHash) { throw 'Candidate changed.' } }
        catch { $cleanupErrors.Add('candidate integrity') }
    }
    $receiptData.cleanupVerified = ($cleanupErrors.Count -eq 0)
    if ($cleanupErrors.Count -ne 0) { $receiptData['cleanupErrors'] = @($cleanupErrors); if (-not $failure) { $receiptData.stage = 'cleanup' } }
    if (-not $failure -and $cleanupErrors.Count -eq 0 -and $receiptData.installVerified) { $receiptData.result = 'passed'; $receiptData.stage = 'complete' }
    if (Get-Variable -Name receiptPath -ErrorAction SilentlyContinue) {
        $json = $receiptData | ConvertTo-Json -Depth 5
        $file = [IO.File]::Open($receiptPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $writer = [IO.StreamWriter]::new($file, [Text.UTF8Encoding]::new($false)); try { $writer.WriteLine($json) } finally { $writer.Dispose() } }
        finally { $file.Dispose() }
    }
}
if ($failure) { throw ("MSIX check failed at {0}; HRESULT {1}. See sanitized receipt." -f $receiptData.stage, $receiptData.errorHResult) }
if ($cleanupErrors.Count -ne 0) { throw ('MSIX cleanup failed: ' + ($cleanupErrors -join ', ')) }
