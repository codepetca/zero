# Branch-only experiment. Never merge; does not alter the release verifier or candidate.
param([Parameter(Mandatory)][string]$Original, [Parameter(Mandatory)][string]$Output)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:ImageOS -ne 'win22') { throw 'Disposable Windows 2022 hosted runner required.' }
$base = '51b722eaf9beba3855a6492cbf73927c6b9bc8f6'
$expectedHash = 'c0a5a100d1a29f68cb5018af1a2d5694dc04d16ccd38f2ef8d415ec0bc8bab80'
function Hash($File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function Run($Command, $Arguments) { & $Command @Arguments; if ($LASTEXITCODE -ne 0) { throw ('Command failed: ' + (Split-Path $Command -Leaf)) } }
if ((Hash $Original) -ne $expectedHash) { throw 'Exact .63 baseline hash mismatch.' }
$source = (git rev-parse HEAD).Trim()
$allowed = @('.github/workflows/windows-native.yml','.github/workflows/store-dpi-one-off.yml','.github/scripts/store-dpi-experiment.ps1')
$changed = @(git diff --name-only $base $source)
if ($LASTEXITCODE -ne 0 -or $changed.Count -ne 3 -or @($changed | Where-Object { $_ -notin $allowed }).Count -ne 0 -or (git status --porcelain)) { throw 'Only three test-infrastructure files may differ from canonical source.' }
New-Item -ItemType Directory -Path $Output -ErrorAction Stop | Out-Null
$work = Join-Path $env:RUNNER_TEMP 'zero-dpi-build'; New-Item -ItemType Directory -Path $work | Out-Null
$payload = Join-Path $work 'payload'; New-Item -ItemType Directory -Path $payload | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$build = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $Original) 'build-msix.json') -Raw | ConvertFrom-Json
if ($build.artifact.sha256 -ne $expectedHash -or $build.sourceRevision -ne '5952efd27cab104b2c9a088a1532fc36ba6e26ec' -or $build.sourceDirty -ne $false -or $build.kitVersion -ne '0.5.63') { throw 'Original build receipt mismatch.' }
$archive = [IO.Compression.ZipFile]::OpenRead($Original)
try {
    foreach ($file in $build.artifact.files) {
        if ($file.name -notmatch '^(Zero\.exe|Zero\.exe\.config|Newtonsoft\.Json\.dll|AppxManifest\.xml|Assets/(StoreLogo|Square44x44Logo|Square150x150Logo)\.png)$') { throw 'Unexpected baseline member.' }
        $target = Join-Path $payload $file.name
        [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($archive.GetEntry($file.name), $target)
        if ((Hash $target) -ne $file.sha256) { throw 'Original payload hash mismatch.' }
    }
} finally { $archive.Dispose() }
$originalExe = Join-Path $work 'original-Zero.exe'; Copy-Item -LiteralPath (Join-Path $payload 'Zero.exe') -Destination $originalExe
$kitFile = Join-Path $work 'zero-bootstrap.zip'; $icon = Join-Path $work 'Zero.ico'
Run 'npm' @('ci')
@'
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildWindowsIcon} from './scripts/windows-icon.mjs';
const [exe,receipt,kit,icon]=process.argv.slice(2), b=readFileSync(exe), r=JSON.parse(readFileSync(receipt,'utf8'));
let count=0;
for(let at=b.indexOf(Buffer.from('PK\x03\x04'));at>=0;at=b.indexOf(Buffer.from('PK\x03\x04'),at+1)) {
 const block=b.subarray(at,at+r.kit.size);
 if(block.length===r.kit.size && createHash('sha256').update(block).digest('hex')===r.kit.sha256) {writeFileSync(kit,block);count++;}
}
if(count!==1) throw new Error('Expected one exact measured embedded kit.');
buildWindowsIcon(process.cwd(),icon);
'@ | node --input-type=module - $originalExe (Join-Path (Split-Path -Parent $Original) 'build-msix.json') $kitFile $icon
if ($LASTEXITCODE -ne 0) { throw 'Exact-kit extraction/icon preparation failed.' }
$compiled = Join-Path $work 'compiled'
Run 'dotnet' @('publish','native-installer/windows/ZeroSetup.csproj','-c','Release','-o',$compiled,
    '-p:ZeroDistribution=Store','-p:PlatformTarget=AnyCPU','-p:Prefer32Bit=false','-p:RuntimeIdentifier=win-x64',
    "-p:ZeroIcon=$icon","-p:ZeroKitZip=$kitFile",'-p:Version=0.5.63','-p:AssemblyVersion=1.5.63.0',
    "-p:BaseIntermediateOutputPath=$work\obj\","-p:BaseOutputPath=$work\bin\","-p:RestorePackagesPath=$work\nuget",
    '-p:NuGetAudit=false','-p:RestoreLockedMode=true')
foreach ($name in @('Zero.exe.config','Newtonsoft.Json.dll')) {
    if ((Hash (Join-Path $compiled $name)) -ne (Hash (Join-Path $payload $name))) { throw 'Non-launcher payload changed.' }
}
Copy-Item -LiteralPath (Join-Path $compiled 'Zero.exe') -Destination (Join-Path $payload 'Zero.exe') -Force
function Pe-Info($File) {
    $b = [IO.File]::ReadAllBytes($File); $pe = [BitConverter]::ToInt32($b,60); $opt = $pe+24
    $magic = [BitConverter]::ToUInt16($b,$opt); $dd = $opt + $(if ($magic -eq 523) {112} else {96})
    $clrRva = [BitConverter]::ToUInt32($b,$dd+14*8); $section = $opt+[BitConverter]::ToUInt16($b,$pe+20); $clr = $null
    for ($i=0;$i -lt [BitConverter]::ToUInt16($b,$pe+6);$i++) {
        $at = $section+40*$i; $va = [BitConverter]::ToUInt32($b,$at+12); $size = [Math]::Max([BitConverter]::ToUInt32($b,$at+8),[BitConverter]::ToUInt32($b,$at+16))
        if ($clrRva -ge $va -and $clrRva -lt $va+$size) { $clr = [int]($clrRva-$va+[BitConverter]::ToUInt32($b,$at+20)) }
    }
    if ($null -eq $clr) { throw 'No CLR header.' }
    [ordered]@{ sha256=(Hash $File); machine=[BitConverter]::ToUInt16($b,$pe+4); optionalMagic=$magic
        nativeEntryPoint=[BitConverter]::ToUInt32($b,$opt+16); importRva=[BitConverter]::ToUInt32($b,$dd+8)
        clrFlags=[BitConverter]::ToUInt32($b,$clr+16) }
}
$originalPe = Pe-Info $originalExe; $variantPe = Pe-Info (Join-Path $payload 'Zero.exe')
if ($variantPe.machine -ne 332 -or ($variantPe.clrFlags -band 1) -eq 0 -or ($variantPe.clrFlags -band 131074) -ne 0) { throw 'Variant is not AnyCPU IL-only with both 32-bit flags clear.' }
$tools = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
foreach ($tool in @('makeappx.exe','mt.exe')) {
    $signature = Get-AuthenticodeSignature -LiteralPath (Join-Path $tools $tool)
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O=Microsoft Corporation(?:,|$)') { throw 'Pinned SDK tool signature invalid.' }
}
foreach ($item in @(@('original',$originalExe),@('anycpu',(Join-Path $payload 'Zero.exe')))) {
    $manifest = Join-Path $Output ($item[0]+'-embedded.manifest')
    Run (Join-Path $tools 'mt.exe') @('-nologo',('-inputresource:'+$item[1]+';#1'),('-out:'+$manifest))
    Run (Join-Path $tools 'mt.exe') @('-nologo','-manifest',$manifest,'-validate_manifest')
}
$package = Join-Path $Output 'Zero-0.5.63-anycpu-dpi-experiment.msix'
Run (Join-Path $tools 'makeappx.exe') @('pack','/d',$payload,'/p',$package)
$build.sourceRevision = $source; $build.artifact.filename = Split-Path $package -Leaf
$build.artifact.sha256 = Hash $package; $build.artifact.size = (Get-Item -LiteralPath $package).Length
$build.artifact.files | Where-Object { $_.name -eq 'Zero.exe' } | ForEach-Object { $_.sha256 = Hash (Join-Path $payload 'Zero.exe'); $_.size = (Get-Item -LiteralPath (Join-Path $payload 'Zero.exe')).Length }
$build | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $Output 'build-msix.json') -Encoding utf8
[ordered]@{ schema=1; kind='AnyCPU-DPI-experiment-not-a-release-candidate'; canonicalSourceRevision=$base; testSourceRevision=$source
    sourceEquivalentExcluding=$changed; originalCandidateSha256=$expectedHash; variantCandidateSha256=(Hash $package)
    platformTarget='AnyCPU'; prefer32Bit=$false; packageArchitecture='x64'; kit=$build.kit
    originalPe=$originalPe; variantPe=$variantPe
    originalManifestSha256=(Hash (Join-Path $Output 'original-embedded.manifest'))
    variantManifestSha256=(Hash (Join-Path $Output 'anycpu-embedded.manifest'))
    releaseVerifierUnchanged=$true
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $Output 'experiment.json') -Encoding utf8
$monitor = Start-Job -ArgumentList (Join-Path $Output 'runtime-bitness.json') -ScriptBlock {
    param($ReportPath)
    $ErrorActionPreference = 'Stop'
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ZeroBitness {
 [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsWow64Process2(IntPtr process, out ushort processMachine, out ushort nativeMachine);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static ushort[] Read(uint pid) {
  IntPtr handle=OpenProcess(0x1000,false,pid); if(handle==IntPtr.Zero) throw new Exception("OpenProcess failed");
  try { ushort processMachine,nativeMachine; if(!IsWow64Process2(handle,out processMachine,out nativeMachine)) throw new Exception("IsWow64Process2 failed"); return new ushort[]{processMachine,nativeMachine}; }
  finally { CloseHandle(handle); }
 }
}
'@
    $deadline = [datetime]::UtcNow.AddMinutes(10)
    while ([datetime]::UtcNow -lt $deadline) {
        $packages = @(Get-AppxPackage -Name 'Codepet.zerostudio' | Where-Object { $_.Version.ToString() -eq '1.5.63.0' })
        if ($packages.Count -eq 1) {
            $exe = Join-Path $packages[0].InstallLocation 'Zero.exe'
            foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name='Zero.exe'" | Where-Object { $_.ExecutablePath -eq $exe })) {
                $machine = [ZeroBitness]::Read($process.ProcessId)
                [ordered]@{ schema=1; packageFullName=$packages[0].PackageFullName; processId=$process.ProcessId
                    processMachine=$machine[0]; nativeMachine=$machine[1]; is64Bit=($machine[0] -eq 0 -and $machine[1] -eq 34404)
                } | ConvertTo-Json | Set-Content -LiteralPath $ReportPath -Encoding utf8
                return
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'No actual packaged launcher observed.'
}
try {
    & ./scripts/test-windows-msix.ps1 -Package $package -PackageVersion '1.5.63.0' -Receipt (Join-Path $Output 'install-wack.json') -RunFirstRun -RunWack
} finally {
    Wait-Job -Job $monitor -Timeout 5 | Out-Null
    if ($monitor.State -eq 'Running') { Stop-Job -Job $monitor }
    Receive-Job -Job $monitor
    Remove-Job -Job $monitor
    if ((Hash $Original) -ne $expectedHash) { throw 'Original immutable candidate changed.' }
    if (Test-Path -LiteralPath (Join-Path $Output 'runtime-bitness.json')) {
        $bitness = Get-Content -LiteralPath (Join-Path $Output 'runtime-bitness.json') -Raw | ConvertFrom-Json
        if ($bitness.is64Bit -ne $true) { throw 'AnyCPU launcher was not verified as a native 64-bit process.' }
    } else { throw 'Actual launcher bitness proof missing.' }
}
