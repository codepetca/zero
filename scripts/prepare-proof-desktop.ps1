[CmdletBinding()]
param([Parameter(Mandatory)][string]$Directory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:RUNNER_OS -ne 'Windows' -or $env:GITHUB_REPOSITORY -ne 'codepetca/zero' -or
    $env:GITHUB_ACTOR -ne 'armorup' -or $env:GITHUB_TRIGGERING_ACTOR -ne 'armorup' -or $env:GITHUB_REF -ne 'refs/heads/codex/zero-089-windows-interactive-proof') {
    throw 'This step is only for the authorized disposable Windows QA run.'
}

$null = New-Item -ItemType Directory -Path $Directory
$windowsCli = Join-Path $Directory 'devtunnel.exe'
Invoke-WebRequest -UseBasicParsing -Uri https://aka.ms/TunnelsCliDownload/win-x64 -OutFile $windowsCli
$signature = Get-AuthenticodeSignature -FilePath $windowsCli
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
    throw 'Dev Tunnels must have its valid Microsoft signature.'
}

$rdpRule = @{
    DisplayName='Zero QA denies direct network RDP'
    Direction='Inbound'
    Action='Block'
    Profile='Any'
    Protocol='TCP'
    LocalPort='3389'
    RemoteAddress=@('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')
}
if (@(Get-NetFirewallProfile | Where-Object { -not $_.Enabled }).Count -ne 0) {
    throw 'The Windows firewall must be active before enabling the private RDP listener.'
}
New-NetFirewallRule @rdpRule | Out-Null
$rdp = 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server'
$listener = Join-Path $rdp 'WinStations\RDP-Tcp'
if ((Get-ItemProperty -LiteralPath $listener -Name PortNumber).PortNumber -ne 3389) {
    throw 'The disposable runner must use the expected Remote Desktop port.'
}
Set-ItemProperty -LiteralPath $listener -Name UserAuthentication -Value 1
Set-ItemProperty -LiteralPath $listener -Name SecurityLayer -Value 2
Set-ItemProperty -LiteralPath $rdp -Name fSingleSessionPerUser -Value 1
Set-ItemProperty -LiteralPath $rdp -Name fDenyTSConnections -Value 0
$windowsUser = [Environment]::UserName
if ($windowsUser -ne 'runneradmin') { throw 'Expected the disposable runner desktop account.' }
$password = 'Za1!' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
Set-LocalUser -Name $windowsUser -Password (ConvertTo-SecureString $password -AsPlainText -Force)
Start-Service -Name TermService
$cert = $null
for ($attempt=0; $attempt -lt 30 -and -not $cert; $attempt++) {
    $session = Get-CimInstance -Namespace 'root/cimv2/TerminalServices' -ClassName Win32_TSGeneralSetting -Filter "TerminalName='RDP-tcp'"
    $hash = $session.SSLCertificateSHA1Hash
    if ($hash) {
        $cert = Get-ChildItem -Path 'Cert:\LocalMachine\Remote Desktop','Cert:\LocalMachine\My' -ErrorAction SilentlyContinue |
            Where-Object Thumbprint -eq $hash | Select-Object -First 1
    }
    if (-not $cert) { Start-Sleep -Seconds 1 }
}
if (-not $cert -or $session.UserAuthenticationRequired -ne 1 -or $session.SecurityLayer -ne 2) {
    throw 'Could not establish the expected NLA and pinned TLS certificate on this runner.'
}
$hash256 = $cert.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256)
[pscustomobject]@{user=$windowsUser; computer=$env:COMPUTERNAME; password=$password; fingerprint=$hash256} |
    ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $Directory 'private-rdp.json')
