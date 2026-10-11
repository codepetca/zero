# Windows PowerShell 5.1; no policy changes, downloads or installs during --check.
param([switch]$Check)
if ($args.Count -eq 1 -and $args[0] -eq '--check') { $Check = $true }
elseif ($args.Count -gt 0) { Write-Host 'Usage: Setup.cmd [--check]'; exit 2 }
$ErrorActionPreference = 'Stop'
$KitDir = Split-Path -Parent $PSScriptRoot
$Starter = Join-Path $KitDir 'starter'
$Code = $null
$CliScript = $null
$KitVersion = ''
$ExtensionId = ''
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
function Invoke-Tool([string]$File, [string[]]$Arguments, [bool]$NodeCli = $false, [int]$Timeout = 20000) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = (($Arguments | ForEach-Object { Quote-Native $_ }) -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    if ($NodeCli) { $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1' }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($Timeout)) {
            $process.Kill()
            $process.WaitForExit()
            return @{ Exit = 124; Output = 'Tool check timed out. Close setup and try again.' }
        }
        return @{ Exit = $process.ExitCode; Output = ($stdout.Result + $stderr.Result) }
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
    $script:Code = $null; $script:CliScript = $null
    $candidates = @()
    $command = Get-Command code -ErrorAction SilentlyContinue
    if ($command -and $command.Source -match '\\bin\\code\.cmd$') {
        $candidates += Join-Path (Split-Path (Split-Path $command.Source -Parent) -Parent) 'Code.exe'
    }
    foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }
        if ($base -eq $env:LOCALAPPDATA) { $candidates += Join-Path $base 'Programs\Microsoft VS Code\Code.exe' }
        else { $candidates += Join-Path $base 'Microsoft VS Code\Code.exe' }
    }
    foreach ($candidate in $candidates) {
        $cli = Join-Path (Split-Path $candidate -Parent) 'resources\app\out\cli.js'
        if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and (Test-Path -LiteralPath $cli -PathType Leaf)) {
            $script:Code = $candidate; $script:CliScript = $cli
            if ((Invoke-Code @('--version')).Exit -eq 0) { return }
        }
    }
    $script:Code = $null; $script:CliScript = $null
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
    $script:GitOK = $false
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if (-not $git) { return }
    $result = Invoke-Tool $git.Source @('--version')
    if ($result.Exit -eq 0 -and $result.Output -match '^git version (\d+\.\d+\.\d+)') {
        $script:GitOK = Meets-Version $Matches[1] '2.31.0'
    }
}
function Find-Kit {
    $script:KitOK = $false; $script:KitVersion = ''; $script:ExtensionId = ''
    $metadata = Join-Path $PSScriptRoot 'kit.properties'
    if (Test-Path -LiteralPath $metadata -PathType Leaf) {
        foreach ($line in Get-Content -LiteralPath $metadata) {
            if ($line -match '^kitVersion=(\d+\.\d+\.\d+)$') { $script:KitVersion = $Matches[1] }
            if ($line -eq 'extensionId=zero.zero') { $script:ExtensionId = 'zero.zero' }
        }
    }
    if (-not $KitVersion -or -not $ExtensionId) { Write-Host 'Kit metadata missing or invalid. Extract the complete kit again.'; return }
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
function Is-Ready { return $KitOK -and $Code -and $JavaOK -and $ExtensionsOK }
function Show-Check {
    Find-Code; Find-Java; Find-Git; Find-Kit; Find-Extensions
    Write-Host "`nZero setup check (profile: Zero)"
    Write-Host $(if ($KitOK) { "Kit $KitVersion`: complete" } else { 'Kit: needs attention' })
    Write-Host $(if ($Code) { "VS Code: $Code" } else { 'VS Code: missing or its command failed' })
    Write-Host $(if ($JavaOK) { "JDK: Java $JavaVersion and javac $JavacVersion" } else { "JDK: needs matching java + javac major versions 17+ (java: $JavaVersion, javac: $JavacVersion)" })
    if ($env:JAVA_HOME) { Write-Host "Selected JAVA_HOME: $env:JAVA_HOME" }
    Write-Host $(if (-not $ProfileOK) { 'Zero profile: unavailable; create/import before installing extensions' } elseif ($ExtensionsOK) { 'Zero profile extensions: ready' } else { 'Zero profile extensions: Zero/Java missing or Zero too old' })
    if ($ProfileOK -and -not $Extensions.ContainsKey('vscjava.vscode-java-debug')) { Write-Host 'Java debugger: missing (optional; Run App still works)' }
    Write-Host $(if ($GitOK) { 'Git: ready for optional sharing' } else { 'Git 2.31+: missing/old (optional; local apps can run without it)' })
}
function Help-Tool([string]$Tool) {
    switch ($Tool) {
        code { Find-Code; if ($Code) { Write-Host 'VS Code is already available. Use Check again.'; return } }
        java { Find-Java; if ($JavaOK) { Write-Host 'A suitable JDK is already available. Use Check again.'; return } }
        git { Find-Git; if ($GitOK) { Write-Host 'A suitable Git is already available. Use Check again.'; return } }
    }
    switch ($Tool) {
        code { $title = 'VS Code'; $id = 'Microsoft.VisualStudioCode'; $url = 'https://code.visualstudio.com/download' }
        java { $title = 'Temurin JDK 17'; $id = 'EclipseAdoptium.Temurin.17.JDK'; $url = 'https://adoptium.net/temurin/releases/?version=17' }
        git { $title = 'Git (optional sharing)'; $id = 'Git.Git'; $url = 'https://git-scm.com/downloads' }
    }
    Write-Host "`n$title`: school laptops may need your teacher or IT to install software."
    Write-Host 'If blocked, stop and show them the check summary. Do not bypass school restrictions.'
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($winget -and (Confirm-Choice "Use existing winget to install $title ($id)? You will review package terms and any administrator prompt.")) {
        # Existing package manager only; do not bypass consent or request elevation.
        & $winget.Source install --exact --id $id --source winget --interactive
        Write-Host "winget finished with exit code $LASTEXITCODE."
    } elseif (Confirm-Choice "Open the official $title download page?") { Start-Process $url }
    Write-Host 'After installing, close VS Code completely and reopen setup. Windows may need a restart to refresh PATH/JAVA_HOME.'
}
try {
    Show-Check
    if ($Check) { if (Is-Ready) { exit 0 } else { exit 1 } }
    Write-Host "`nWelcome! Nothing is installed until you choose an action."
    Write-Host 'You do not need Node.js, Python or global Maven.'
    Write-Host 'If JAVA_HOME points to an old/missing JDK, ask your teacher/IT to correct it.'
    Write-Host 'Optional quiet profile: import BEFORE installing extensions, using VS Code Profiles > Import Profile > Select File:'
    Write-Host (Join-Path $KitDir 'optional\Zero.code-profile')
    Write-Host 'Choose the name Zero. Action 4 instead creates an empty Zero profile without those optional settings.'
    :menu while ($true) {
        Write-Host "`n1 VS Code install help   2 JDK install help   3 Git install help"
        Write-Host '4 Open/create Zero profile   5 Install missing extensions in Zero'
        Write-Host '6 Check again   7 Open starter   0 Exit'
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
                if ((Is-Ready) -and (Confirm-Choice 'Open starter in Zero? Close all VS Code windows first if you just changed Java.')) {
                    $result = Invoke-Code @('--new-window', '--profile', 'Zero', $Starter)
                    Write-Host "VS Code exit code: $($result.Exit) $($result.Output)"
                    Write-Host 'Choose Run App in Zero. First run downloads Maven/JavaFX and needs internet.'
                } else { Write-Host 'Finish required setup checks before opening starter.' }
            }
            '0' { break menu }
            default { Write-Host 'Choose a number from the menu.' }
        }
    }
    if (Is-Ready) { exit 0 } else { exit 1 }
} catch { Write-Host "Setup could not complete: $($_.Exception.Message). Ask your teacher/IT and see setup/README.md."; exit 1 }
