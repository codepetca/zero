# Diagnostic-only servicing of Microsoft's toolkit on a disposable hosted runner.
[CmdletBinding()]
param([Parameter(Mandatory)][string] $Receipt)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or
    $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows' -or $env:ImageOS -ne 'win22') {
    throw 'Manual disposable GitHub-hosted windows-2022 runner required.'
}
$receiptPath = [IO.Path]::GetFullPath($Receipt)
if (Test-Path -LiteralPath $receiptPath) { throw 'Toolkit servicing receipt must be new.' }
$parent = Split-Path -Parent $receiptPath
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$work = Join-Path $env:RUNNER_TEMP ('zero-wack-servicing-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$tool = 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe'
$data = [ordered]@{
    schema = 1; purpose = 'Diagnostic toolkit servicing only; no package approval'
    installerUrl = 'https://download.microsoft.com/download/46742ab5-6592-4968-a793-129e7f3bc55a/KIT_BUNDLE_WINDOWSSDK_MEDIACREATION/winsdksetup.exe'
    installerSha256 = 'b0bdbad38ae74c40ccae8cdbcf229807627fba2bc3100be28301c4ba884f755e'
    requestedSdk = '10.0.26100.9457'; feature = 'OptionId.WindowsSoftwareLogoToolkit'
    before = $null; after = $null; exitCode = $null; result = 'failed'
}
function Get-ToolkitEvidence {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { return $null }
    return [ordered]@{ fileVersion = (Get-Item -LiteralPath $tool).VersionInfo.FileVersion;
        sha256 = (Get-FileHash -LiteralPath $tool -Algorithm SHA256).Hash.ToLowerInvariant() }
}
try {
    $data.before = Get-ToolkitEvidence
    $installer = Join-Path $work 'winsdksetup.exe'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $data.installerUrl -OutFile $installer -UseBasicParsing -TimeoutSec 120
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $data.installerSha256) { throw 'Toolkit installer hash mismatch.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
        $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') { throw 'Toolkit installer must have valid Microsoft Authenticode.' }
    $data.installerFileVersion = (Get-Item -LiteralPath $installer).VersionInfo.FileVersion
    $process = Start-Process -FilePath $installer -ArgumentList @('/quiet', '/norestart', '/ceip', 'off', '/features', $data.feature) -PassThru
    try {
        if (-not $process.WaitForExit(900000)) {
            & taskkill.exe /PID $process.Id /T /F | Out-Null
            $null = $process.WaitForExit(30000)
            throw 'Toolkit servicing timed out.'
        }
        $process.Refresh(); $data.exitCode = $process.ExitCode
        if ($process.ExitCode -ne 0) { throw 'Toolkit servicing did not complete without a restart.' }
    } finally { $process.Dispose() }
    $data.after = Get-ToolkitEvidence
    if (-not $data.after) { throw 'Toolkit servicing left no certification tool.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $tool
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
        $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') { throw 'Serviced WACK must have valid Microsoft Authenticode.' }
    $data.result = 'servicing-completed-validation-still-required'
} finally {
    try { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction Stop }
    finally { $data | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $receiptPath -Encoding UTF8 }
}
