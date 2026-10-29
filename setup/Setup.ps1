# Windows PowerShell 5.1; no policy changes, downloads or installs during --check.
param([switch]$Check, [switch]$NativeCheck, [string]$NativePlan,
    [switch]$NativeProfile, [string]$NativeExtension, [switch]$Approved, [switch]$NativeOpen)
# Validate the complete machine request before probing tools or making changes.
$nativeCount = @('NativeCheck', 'NativePlan', 'NativeProfile', 'NativeExtension', 'NativeOpen' | Where-Object { $PSBoundParameters.ContainsKey($_) }).Count
if ($args.Count -eq 1 -and $args[0] -eq '--check' -and $PSBoundParameters.Count -eq 0) { $Check = $true }
elseif ($args.Count -gt 0) { Write-Host 'Usage: Setup.cmd [--check]'; exit 2 }
if ($nativeCount -gt 0) {
    $expectedCount = if ($NativeExtension) { 2 } else { 1 }
    if ($nativeCount -ne 1 -or $PSBoundParameters.Count -ne $expectedCount -or
        ($PSBoundParameters.ContainsKey('NativeCheck') -and -not $NativeCheck) -or
        ($PSBoundParameters.ContainsKey('NativeProfile') -and -not $NativeProfile) -or
        ($PSBoundParameters.ContainsKey('NativeOpen') -and -not $NativeOpen) -or
        ($PSBoundParameters.ContainsKey('NativePlan') -and $NativePlan -notin @('code', 'java')) -or
        ($PSBoundParameters.ContainsKey('NativeExtension') -and ($NativeExtension -notin @('zero', 'java') -or -not $Approved))) { exit 2 }
} elseif ($Approved -or $PSBoundParameters.ContainsKey('Approved')) { exit 2 }
$ErrorActionPreference = 'Stop'
$KitDir = Split-Path -Parent $PSScriptRoot
$Starter = Join-Path $KitDir 'starter'
$Code = $null
$CliScript = $null
$KitVersion = ''
$ExtensionId = ''
$VsCodeMinimum = ''
$CodeVersion = ''
$CodeDiagnostics = @()
$Extensions = @{}
$KitOK = $false
$JavaOK = $false
$GitOK = $false
$ProfileOK = $false
$ExtensionsOK = $false

function Confirm-Choice([string]$Question) {
    return (Read-Host "$Question [y/N]") -match '^(y|yes)$'
}
function Quote-Native([string]$Value) {
    # Windows native argv quoting: preserve spaces, embedded quotes and final slashes.
    return '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}
function Initialize-BoundedReader {
    if ('ZeroSetupBoundedReader' -as [type]) { return }
    # Windows PowerShell 5.1's compiler supports this dependency-free C# helper.
    # Drain both pipes while retaining bounded diagnostics, including child-held pipes.
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
public static class ZeroSetupBoundedReader {
    public static async Task<string> Read(StreamReader reader) {
        var text = new StringBuilder();
        var buffer = new char[4096];
        bool truncated = false;
        int count;
        while ((count = await reader.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) > 0) {
            int keep = Math.Min(count, 262144 - text.Length);
            if (keep > 0) text.Append(buffer, 0, keep);
            if (keep < count) truncated = true;
        }
        if (truncated) text.Append("\r\n[Tool output truncated.]\r\n");
        return text.ToString();
    }
}
'@
}
function Invoke-Tool([string]$File, [string[]]$Arguments, [bool]$NodeCli = $false, [int]$Timeout = 20000) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = (($Arguments | ForEach-Object { Quote-Native $_ }) -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = $true
    $info.EnvironmentVariables['ZERO_KIT_DIR'] = $KitDir
    if ($NodeCli) { $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1' }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        Initialize-BoundedReader
        [void]$process.Start()
        $process.StandardInput.Close()
        $stdout = [ZeroSetupBoundedReader]::Read($process.StandardOutput)
        $stderr = [ZeroSetupBoundedReader]::Read($process.StandardError)
        if (-not $process.WaitForExit($Timeout)) {
            $process.Kill()
            [void]$process.WaitForExit(5000)
            return @{ Exit = 124; Output = 'Tool check timed out. Close setup and try again.' }
        }
        if (-not [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]@($stdout, $stderr), 2000)) {
            return @{ Exit = 1; Output = 'Tool output was incomplete. Close remaining tool processes and check again.' }
        }
        $output = $stdout.Result + $stderr.Result
        if ($output.Contains('[Tool output truncated.]')) { return @{ Exit = 1; Output = $output } }
        return @{ Exit = $process.ExitCode; Output = $output }
    } catch { return @{ Exit = 1; Output = $_.Exception.Message } }
    finally { $process.Dispose() }
}
function Invoke-Code([string[]]$Arguments, [int]$Timeout = 20000) {
    # The standard VS Code Windows bin/code.cmd uses Code.exe + this public CLI.
    # Running that entry directly avoids cmd.exe path expansion and quoting pitfalls.
    return Invoke-Tool $Code (@($CliScript) + $Arguments) $true $Timeout
}
function Meets-Version([string]$Actual, [string]$Required) {
    if ($Actual -notmatch '^\d+\.\d+\.\d+$') { return $false }
    try { return [version]$Actual -ge [version]$Required } catch { return $false }
}
function Find-Code {
    $script:Code = $null; $script:CliScript = $null; $script:CodeVersion = ''; $script:CodeDiagnostics = @()
    $candidates = @()
    $command = Get-Command code -ErrorAction SilentlyContinue
    if ($command -and $command.Source -match '\\bin\\code\.cmd$') {
        $candidates += Join-Path (Split-Path (Split-Path $command.Source -Parent) -Parent) 'Code.exe'
    } elseif ($command -and $command.Source -match '\\Code\.exe$') {
        $candidates += $command.Source
    }
    foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }
        if ($base -eq $env:LOCALAPPDATA) { $candidates += Join-Path $base 'Programs\Microsoft VS Code\Code.exe' }
        else { $candidates += Join-Path $base 'Microsoft VS Code\Code.exe' }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        $cli = Join-Path (Split-Path $candidate -Parent) 'resources\app\out\cli.js'
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
            $script:CodeDiagnostics += "VS Code candidate: $candidate (standard CLI missing)"; continue
        }
        $result = Invoke-Tool $candidate @($cli, '--version') $true
        $actual = ($result.Output -split '\r?\n')[0]
        if ($result.Exit -eq 0 -and $VsCodeMinimum -and (Meets-Version $actual $VsCodeMinimum) -and $actual.Split('.')[0] -eq $VsCodeMinimum.Split('.')[0]) {
            if (-not $Code) { $script:Code = $candidate; $script:CliScript = $cli; $script:CodeVersion = $actual }
        } else {
            $script:CodeDiagnostics += "VS Code candidate: $candidate ($actual; failed/unparseable/incompatible; requires $VsCodeMinimum in the same major)"
        }
    }
}
function Find-Java {
    $script:JavaOK = $false; $script:JavaVersion = ''; $script:JavacVersion = ''
    # Maven uses JAVA_HOME first. A bad value remains a repair item, never ignored.
    if ($env:JAVA_HOME) {
        $java = Join-Path $env:JAVA_HOME 'bin\java.exe'
        $javac = Join-Path $env:JAVA_HOME 'bin\javac.exe'
    } else {
        $j = Get-Command java.exe -ErrorAction SilentlyContinue
        $c = Get-Command javac.exe -ErrorAction SilentlyContinue
        $java = if ($j) { $j.Source } else { '' }
        $javac = if ($c) { $c.Source } else { '' }
    }
    $script:JavaCommand = $java; $script:JavacCommand = $javac
    if ($java -and (Test-Path -LiteralPath $java -PathType Leaf)) {
        $result = Invoke-Tool $java @('-version')
        if ($result.Exit -eq 0 -and $result.Output -match '(?m)^(?:openjdk|java) version "([0-9]+(?:\.[0-9]+)*)') { $script:JavaVersion = $Matches[1] }
    }
    if ($javac -and (Test-Path -LiteralPath $javac -PathType Leaf)) {
        $result = Invoke-Tool $javac @('-version')
        if ($result.Exit -eq 0 -and $result.Output -match '(?m)^javac ([0-9]+(?:\.[0-9]+)*)') { $script:JavacVersion = $Matches[1] }
    }
    $script:JavaOK = $JavaVersion -ne '' -and $JavacVersion -ne '' -and $JavaVersion.Split('.')[0] -eq $JavacVersion.Split('.')[0] -and [int]($JavaVersion.Split('.')[0]) -ge 17
}
function Find-Git {
    $script:GitOK = $false; $script:GitVersion = ''; $script:GitCommand = ''
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if (-not $git) { return }
    $script:GitCommand = $git.Source
    $result = Invoke-Tool $git.Source @('--version')
    if ($result.Exit -eq 0 -and $result.Output -match '^git version (\d+\.\d+\.\d+)') {
        $script:GitVersion = $Matches[1]
        $script:GitOK = Meets-Version $Matches[1] '2.31.0'
    }
}
function Find-Kit {
    $script:KitOK = $false; $script:KitVersion = ''; $script:ExtensionId = ''; $script:VsCodeMinimum = ''
    $metadata = Join-Path $PSScriptRoot 'kit.properties'
    if (Test-Path -LiteralPath $metadata -PathType Leaf) {
        $lines = @(Get-Content -LiteralPath $metadata)
        $versions = @($lines | Where-Object { $_ -match '^kitVersion=' })
        $ids = @($lines | Where-Object { $_ -match '^extensionId=' })
        $minimums = @($lines | Where-Object { $_ -match '^vscodeMinimum=' })
        if ($versions.Count -eq 1 -and $versions[0] -match '^kitVersion=(\d+\.\d+\.\d+)$') { $script:KitVersion = $Matches[1] }
        if ($ids.Count -eq 1 -and $ids[0] -eq 'extensionId=zero.zero') { $script:ExtensionId = 'zero.zero' }
        if ($minimums.Count -eq 1 -and $minimums[0] -match '^vscodeMinimum=(\d+\.\d+\.\d+)$') { $script:VsCodeMinimum = $Matches[1] }
    }
    if (-not $KitVersion -or -not $ExtensionId -or -not $VsCodeMinimum) { $script:VsCodeMinimum = ''; Write-Host 'Kit metadata missing or invalid. Extract the complete kit again.'; return }
    $script:Vsix = Join-Path $KitDir "zero-$KitVersion.vsix"
    $files = @($Vsix, (Join-Path $KitDir 'optional\Zero.code-profile'))
    foreach ($relative in @('zero.json', 'pom.xml', 'mvnw', 'mvnw.cmd', '.mvn\wrapper\maven-wrapper.properties', '.vscode\tasks.json')) {
        $files += Join-Path $Starter $relative
    }
    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Write-Host "Missing kit file: $file. Extract the complete kit again."; return }
    }
    $script:KitOK = $true
}
function Find-Extensions {
    $script:Extensions = @{}; $script:ProfileOK = $false; $script:ExtensionsOK = $false
    if (-not $Code) { return }
    $result = Invoke-Code @('--profile', 'Zero', '--list-extensions', '--show-versions')
    if ($result.Exit -ne 0) { return }
    $script:ProfileOK = $true
    foreach ($line in ($result.Output -split '\r?\n')) {
        if ($line -match '^([a-z0-9][a-z0-9.-]*)@(.+)$') { $script:Extensions[$Matches[1]] = $Matches[2] }
    }
    $script:ExtensionsOK = (Meets-Version $Extensions[$ExtensionId] $KitVersion) -and $Extensions.ContainsKey('redhat.java')
}
function Is-Ready { return $KitOK -and $Code -and $JavaOK -and $ProfileOK -and $ExtensionsOK }
function Show-Check {
    Find-Kit; Find-Code; Find-Java; Find-Git; Find-Extensions
    Write-Host "`nZero setup check (profile: Zero)"
    Write-Host $(if ($KitOK) { "Kit $KitVersion`: complete" } else { 'Kit: needs attention' })
    Write-Host $(if ($Code) { "VS Code: $CodeVersion at $Code" } else { 'VS Code: missing or incompatible; see candidate details' })
    foreach ($detail in $CodeDiagnostics) { Write-Host $detail }
    Write-Host $(if ($JavaOK) { "JDK: Java $JavaVersion and javac $JavacVersion" } else { "JDK: needs matching java + javac major versions 17+ (java: $JavaVersion, javac: $JavacVersion)" })
    if ($env:JAVA_HOME) { Write-Host "Selected JAVA_HOME: $env:JAVA_HOME" }
    Write-Host "JDK commands: $JavaCommand ; $JavacCommand"
    Write-Host $(if (-not $ProfileOK) { 'Zero profile: unavailable; create/import before installing extensions' } elseif ($ExtensionsOK) { 'Zero profile extensions: ready' } else { 'Zero profile extensions: Zero/Java missing or Zero too old' })
    if ($ProfileOK -and -not $Extensions.ContainsKey('vscjava.vscode-java-debug')) { Write-Host 'Java debugger: missing (optional; Run App still works)' }
    Write-Host $(if ($GitOK) { "Git: $GitVersion at $GitCommand (ready for optional sharing)" } else { "Git 2.31+: missing/old at $GitCommand (optional; local apps can run without it)" })
}
function Help-Tool([string]$Tool) {
    switch ($Tool) {
        code { Find-Kit; Find-Code; if (-not $VsCodeMinimum) { return }; if ($Code) { Write-Host 'VS Code is already available. Use Check again.'; return } }
        java { Find-Java; if ($JavaOK) { Write-Host 'A suitable JDK is already available. Use Check again.'; return }
            if ($env:JAVA_HOME) { Write-Host 'JAVA_HOME selects an incompatible/missing JDK. Ask your device administrator or IT to select an installed matching JDK 17+; no installation attempted.'; return } }
        git { Find-Git; if ($GitOK) { Write-Host 'A suitable Git is already available. Use Check again.'; return } }
    }
    switch ($Tool) {
        code { $title = 'VS Code'; $id = 'Microsoft.VisualStudioCode'; $url = 'https://code.visualstudio.com/download' }
        java { $title = 'Temurin JDK 17'; $id = 'EclipseAdoptium.Temurin.17.JDK'; $url = 'https://adoptium.net/temurin/releases/?version=17' }
        git { $title = 'Git (optional sharing)'; $id = 'Git.Git'; $url = 'https://git-scm.com/downloads' }
    }
    Write-Host "`n$title`: school laptops may need your device administrator or IT to install software."
    Write-Host 'If blocked, stop and show them the check summary. Do not bypass school restrictions.'
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($winget) {
        # Listing commands never install. If inventory cannot be read, do not guess.
        $inventory = Invoke-Tool $winget.Source @('list', '--source', 'winget', '--disable-interactivity')
        if ($inventory.Exit -ne 0) { Write-Host 'Could not read winget inventory. Ask your device administrator or IT or use the official download page; no installation attempted.'; return }
        $operation = 'install'
        $idPattern = '(?m)(?<![\w.-])' + [regex]::Escape($id) + '(?![\w.-])'
        if ($inventory.Output -match $idPattern) {
            $updates = Invoke-Tool $winget.Source @('upgrade', '--source', 'winget', '--disable-interactivity')
            if ($updates.Exit -ne 0 -or $updates.Output -notmatch $idPattern) {
                Write-Host "winget already knows $id and no update was verified. Review PATH/JAVA_HOME or the selected installation with your device administrator or IT; restart and check again. No reinstall attempted."; return
            }
            $operation = 'upgrade'
        }
        Write-Host "Proposed command: winget $operation --exact --id $id --source winget --interactive"
        if (Confirm-Choice "Use existing winget to $operation $title ($id)? You will review package terms and any administrator prompt.") {
            & $winget.Source $operation --exact --id $id --source winget --interactive
            Write-Host "winget finished with exit code $LASTEXITCODE."
            Show-Check
        } elseif (Confirm-Choice "Open the official $title download page?") { Start-Process $url }
    } elseif (Confirm-Choice "Open the official $title download page?") { Start-Process $url }
    Write-Host 'After installing, close VS Code completely and reopen setup. Windows may need a restart to refresh PATH/JAVA_HOME.'
}
function Show-NativeCheck {
    Show-Check
    $zeroOK = Meets-Version $Extensions[$ExtensionId] $KitVersion
    $redhatOK = $Extensions.ContainsKey('redhat.java')
    $blocked = [bool]$env:JAVA_HOME -and -not $JavaOK
    Write-Output 'ZERO_SETUP_V1'
    foreach ($field in @(@('kit', $KitOK), @('code', [bool]$Code), @('java', $JavaOK),
        @('profile', $ProfileOK), @('zero', $zeroOK), @('redhat', $redhatOK),
        @('javaHomeBlocked', $blocked), @('ready', (Is-Ready)))) {
        Write-Output ($field[0] + '=' + [int][bool]$field[1])
    }
    Write-Output 'END_ZERO_SETUP'
}
function Invoke-NativeAction {
    if ($NativeCheck) { Show-NativeCheck; return 0 }
    if ($NativePlan) {
        Find-Kit
        $action = 'manual'
        if (-not $KitOK) { $action = 'blocked' }
        elseif ($NativePlan -eq 'code') { Find-Code; if ($Code) { $action = 'skip' } }
        else { Find-Java; if ($JavaOK) { $action = 'skip' } elseif ($env:JAVA_HOME) { $action = 'blocked' } }
        # Native system-tool setup is always a deliberate vendor/browser handoff.
        Write-Output "ZERO_PLAN_V1`naction=$action`nEND_ZERO_PLAN"
        return 0
    }
    if ($NativeProfile) {
        Find-Kit; Find-Code; Find-Extensions
        if (-not $KitOK -or -not $Code) { return 1 }
        if ($ProfileOK) { Write-Host 'Existing Zero profile preserved.'; return 0 }
        $result = Invoke-Code @('--new-window')
        Write-Host $result.Output
        return $result.Exit
    }
    if ($NativeExtension) {
        # Re-read state immediately before each approved mutation; keep compatible tools.
        Find-Kit; Find-Code; Find-Extensions
        if (-not $KitOK -or -not $Code -or -not $ProfileOK) { Write-Host 'Complete the kit and import the Zero profile first.'; return 1 }
        if ($NativeExtension -eq 'zero') {
            if (Meets-Version $Extensions[$ExtensionId] $KitVersion) { return 0 }
            $target = $Vsix
        } else {
            if ($Extensions.ContainsKey('redhat.java')) { return 0 }
            $target = 'redhat.java'
        }
        $result = Invoke-Code @('--profile', 'Zero', '--install-extension', $target) 300000
        Write-Host $result.Output
        return $result.Exit
    }
    if ($NativeOpen) {
        Show-Check
        if (-not (Is-Ready)) { Write-Host 'Readiness changed; check again before opening Zero.'; return 1 }
        $result = Invoke-Code @('--new-window', '--profile', 'Zero')
        Write-Host $result.Output
        return $result.Exit
    }
    return 2
}
try {
    if ($nativeCount -gt 0) {
        # Protocol output is captured by the caller; the function's final integer is
        # the exit status, never a menu choice or implicit success.
        $nativeOutput = @(Invoke-NativeAction)
        $nativeExit = [int]$nativeOutput[-1]
        if ($nativeOutput.Count -gt 1) { $nativeOutput[0..($nativeOutput.Count - 2)] | Write-Output }
        exit $nativeExit
    }
    Show-Check
    if ($Check) { if (Is-Ready) { exit 0 } else { exit 1 } }
    Write-Host "`nWelcome! Nothing is installed until you choose an action."
    Write-Host 'You do not need Node.js, Python or global Maven.'
    Write-Host 'If JAVA_HOME points to an old/missing JDK, ask your device administrator or IT to correct it.'
    Write-Host 'Optional quiet profile: import BEFORE installing extensions, using VS Code Profiles > Import Profile > Select File:'
    Write-Host (Join-Path $KitDir 'optional\Zero.code-profile')
    Write-Host 'Choose the name Zero. Action 4 instead creates an empty Zero profile without those optional settings.'
    :menu while ($true) {
        Write-Host "`n1 VS Code install help   2 JDK install help   3 Git install help"
        Write-Host '4 Open/create Zero profile   5 Install missing extensions in Zero'
        Write-Host '6 Check again   7 Open Zero   0 Exit'
        switch (Read-Host 'Choice') {
            '1' { Help-Tool code }
            '2' { Help-Tool java }
            '3' { Help-Tool git }
            '4' {
                if ($Code -and (Confirm-Choice 'Open VS Code using Zero? This creates an empty profile if missing. Import the optional profile FIRST if wanted.')) {
                    $result = Invoke-Code @('--new-window', '--profile', 'Zero')
                    Write-Host "VS Code exit code: $($result.Exit) $($result.Output)"
                }
            }
            '5' {
                Show-Check
                if (-not $KitOK -or -not $ProfileOK) { Write-Host 'Complete the kit and open/import Zero profile first.'; continue }
                foreach ($extension in @($ExtensionId, 'redhat.java', 'vscjava.vscode-java-debug')) {
                    if ($extension -eq $ExtensionId) {
                        if (Meets-Version $Extensions[$extension] $KitVersion) { continue }
                        $target = $Vsix
                    } else {
                        if ($Extensions.ContainsKey($extension)) { continue }
                        $target = $extension
                    }
                    if (Confirm-Choice "Install $extension into the Zero profile?") {
                        $result = Invoke-Code @('--profile', 'Zero', '--install-extension', $target) 300000
                        Write-Host "Extension installer exit code: $($result.Exit) $($result.Output)"
                    }
                }
                Show-Check
            }
            '6' { Show-Check }
            '7' {
                Show-Check
                if ((Is-Ready) -and (Confirm-Choice 'Open Zero to start a tutorial? Close all VS Code windows first if you just changed Java.')) {
                    $result = Invoke-Code @('--new-window', '--profile', 'Zero')
                    Write-Host "VS Code exit code: $($result.Exit) $($result.Output)"
                    Write-Host 'Choose Start tutorial in Zero to create your project.'
                } else { Write-Host 'Finish required setup checks before opening Zero.' }
            }
            '0' { break menu }
            default { Write-Host 'Choose a number from the menu.' }
        }
    }
    if (Is-Ready) { exit 0 } else { exit 1 }
} catch { Write-Host "Setup could not complete: $($_.Exception.Message). Ask your device administrator or IT and see setup/README.md."; exit 1 }
