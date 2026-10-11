param([string]$Source)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$script:checks = 1
function Assert([bool]$Condition, [string]$Name) { if (-not $Condition) { throw "FAILED: $Name" }; $script:checks++ }
# Load only authored functions. Never execute script entry, host discovery, or tools.
foreach ($function in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
    Invoke-Expression $function.Extent.Text
}
$script:KitVersion = '8.9.10'; $script:ExtensionId = 'zero.zero'; $script:VsCodeMinimum = '1.95.0'
$script:Vsix = 'C:\Kit & spaces\zero-8.9.10.vsix'; $script:Starter = 'C:\Kit & spaces\starter'
$script:calls = [System.Collections.Generic.List[string]]::new()
$script:flags = @{ Kit = $true; Code = $true; Java = $true; Profile = $true; Zero = $true; Redhat = $true }
$script:toolExit = 0
function Find-Kit { $script:KitOK = $flags.Kit }
function Find-Code { $script:Code = if ($flags.Code) { 'C:\VS Code\Code.exe' } else { $null } }
function Find-Java { $script:JavaOK = $flags.Java }
function Find-Git { }
function Find-Extensions {
    $script:ProfileOK = $flags.Profile; $script:Extensions = @{}
    if ($flags.Zero) { $script:Extensions['zero.zero'] = $KitVersion }
    if ($flags.Redhat) { $script:Extensions['redhat.java'] = '1.0.0' }
    $script:ExtensionsOK = $flags.Profile -and $flags.Zero -and $flags.Redhat
}
function Show-Check { Find-Kit; Find-Code; Find-Java; Find-Extensions }
function Invoke-Code([string[]]$Arguments, [int]$Timeout = 20000) {
    $script:calls.Add(($Arguments -join '|'))
    return @{ Exit = $script:toolExit; Output = 'fake command output' }
}
function Reset-Native {
    $script:NativeCheck = $false; $script:NativePlan = ''; $script:NativeProfile = $false
    $script:NativeExtension = ''; $script:NativeOpen = $false; $script:Approved = $false
    $calls.Clear(); $script:toolExit = 0
}
Reset-Native; $NativeCheck = $true
$output = @(Invoke-NativeAction)
Assert ($output[-1] -eq 0 -and ($output -join "`n") -match 'ready=1') 'complete check marks ready'
Assert ($calls.Count -eq 0) 'check is read-only'
$flags.Profile = $false; $output = @(Invoke-NativeAction)
Assert (($output -join "`n") -match 'profile=0' -and ($output -join "`n") -match 'ready=0') 'profile required'
$flags.Profile = $true; $flags.Java = $false
$oldHome = $env:JAVA_HOME; $env:JAVA_HOME = 'C:\bad JDK'
try { $output = @(Invoke-NativeAction); Assert (($output -join "`n") -match 'javaHomeBlocked=1') 'invalid explicit JAVA_HOME blocker' }
finally { $env:JAVA_HOME = $oldHome }
Reset-Native; $NativePlan = 'java'; $env:JAVA_HOME = 'C:\bad JDK'
try { $output = @(Invoke-NativeAction); Assert (($output -join "`n") -match 'action=blocked') 'Java plan blocks configured invalid home' }
finally { $env:JAVA_HOME = $oldHome }
$flags.Java = $true; Reset-Native; $NativePlan = 'code'; $flags.Code = $false
$output = @(Invoke-NativeAction); Assert (($output -join "`n") -match 'action=manual') 'missing tool uses handoff'
Assert ($calls.Count -eq 0) 'plan never installs'
$flags.Code = $true; $output = @(Invoke-NativeAction); Assert (($output -join "`n") -match 'action=skip') 'compatible Code retained'
Reset-Native; $NativeProfile = $true; $output = @(Invoke-NativeAction)
Assert ($calls.Count -eq 0) 'existing profile never reopened or created'
$flags.Profile = $false; $output = @(Invoke-NativeAction)
Assert ($calls.Count -eq 1 -and $calls[0] -eq '--new-window') 'missing profile opens ordinary editor only'
Reset-Native; $NativeExtension = 'zero'; $Approved = $true; $flags.Profile = $true
$output = @(Invoke-NativeAction); Assert ($calls.Count -eq 0) 'extension recheck skips compatible Zero'
$flags.Zero = $false; $output = @(Invoke-NativeAction)
Assert ($calls[0] -eq '--profile|Zero|--install-extension|C:\Kit & spaces\zero-8.9.10.vsix') 'literal metadata VSIX argv'
$calls.Clear(); $toolExit = 44; $output = @(Invoke-NativeAction)
Assert ($output[-1] -eq 44) 'extension failure preserved'
Reset-Native; $NativeExtension = 'java'; $Approved = $true; $flags.Redhat = $false
$output = @(Invoke-NativeAction); Assert ($calls[0] -eq '--profile|Zero|--install-extension|redhat.java') 'Java support exact argv'
$calls.Clear(); $flags.Profile = $false; $output = @(Invoke-NativeAction)
Assert ($output[-1] -eq 1 -and $calls.Count -eq 0) 'profile drift blocks extension mutation'
Reset-Native; $NativeOpen = $true; $flags.Profile = $true; $flags.Zero = $true; $flags.Redhat = $true
$output = @(Invoke-NativeAction)
Assert ($calls[0] -eq '--new-window|--profile|Zero|C:\Kit & spaces\starter') 'ready opens starter literal argv'
$calls.Clear(); $flags.Java = $false; $output = @(Invoke-NativeAction)
Assert ($output[-1] -eq 1 -and $calls.Count -eq 0) 'final open rechecks readiness'
# Exercise request rejection through the actual entry point; each exits before tools.
$exe = (Get-Process -Id $PID).Path
foreach ($request in @(@('-NativePlan', 'git'), @('-NativeExtension', 'zero'), @('-NativeExtension', 'other', '-Approved'), @('-NativeCheck', '-NativeOpen'), @('-NativeProfile', 'extra'), @('-NativeOpen', '-Approved'))) {
    & $exe -NoLogo -NoProfile -NonInteractive -File $Source @request | Out-Null
    Assert ($LASTEXITCODE -eq 2) ('reject invalid request ' + ($request -join ' '))
}
# Real process adapter, fake commands only. This also compiles the bounded reader.
if ($PSVersionTable.Platform -eq 'Unix') {
    $fixture = Join-Path ([IO.Path]::GetTempPath()) ('zero fake tool ' + [guid]::NewGuid().ToString('N') + '.sh')
    try {
        [IO.File]::WriteAllText($fixture, "read value || printf 'stdin closed\n'`nprintf 'fake output\n'`nprintf 'fake error\n' >&2`nexit 7`n")
        $result = Invoke-Tool '/bin/sh' @($fixture)
        Assert ($result.Exit -eq 7 -and $result.Output.Contains('stdin closed') -and $result.Output.Contains('fake output') -and $result.Output.Contains('fake error')) 'real adapter captures fake exit and both streams with stdin closed'
        [IO.File]::WriteAllText($fixture, "exec sleep 10`n")
        $result = Invoke-Tool '/bin/sh' @($fixture) $false 100
        Assert ($result.Exit -eq 124) 'real adapter bounds timeout'
        [IO.File]::WriteAllText($fixture, "i=0; while [ `$i -lt 30000 ]; do printf '0123456789'; i=`$((i+1)); done`n")
        $result = Invoke-Tool '/bin/sh' @($fixture)
        Assert ($result.Exit -ne 0 -and $result.Output.Length -lt 270000 -and $result.Output.Contains('[Tool output truncated.]')) 'bounded output cannot pass'
        [IO.File]::WriteAllText($fixture, "sleep 3 &`nexit 0`n")
        $result = Invoke-Tool '/bin/sh' @($fixture)
        Assert ($result.Exit -ne 0 -and $result.Output.Contains('incomplete')) 'child-held pipe cannot pass'
    } finally { Remove-Item -LiteralPath $fixture -ErrorAction SilentlyContinue }
}
Write-Output "Windows PowerShell mocked backend: $checks checks passed."
