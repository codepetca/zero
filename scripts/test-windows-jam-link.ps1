# Run after the first-run proof, before removing its test-signed package.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PageUrl,
    [Parameter(Mandatory)][string]$JamId,
    [Parameter(Mandatory)][string]$ExpectedTitle,
    [Parameter(Mandatory)][string]$ExpectedRules,
    [Parameter(Mandatory)][string]$Receipt
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$stage = 'preflight'; $result = 'failed'; $failure = $null
$browser = $null; $editor = $null; $driver = $null; $scratch = $null
$family = 'Codepet.zerostudio_g62pw1js6rhjp'
try {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable hosted Windows runner required.' }
    if (-not [Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -le 0) { throw 'An interactive non-session-0 desktop is required.' }
    if ($JamId -cnotmatch '\Ajam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})\z') { throw 'Invalid jam ID.' }
    $uri = [Uri]$PageUrl
    if ($uri.Scheme -ne 'http' -or $uri.Host -notin @('127.0.0.1','localhost') -or $uri.UserInfo -or $uri.Fragment) { throw 'The fixture must be served from loopback HTTP.' }
    if ([string]::IsNullOrWhiteSpace($ExpectedTitle) -or [string]::IsNullOrWhiteSpace($ExpectedRules)) { throw 'Expected live title and rules are required.' }
    $packages = @(Get-AppxPackage -Name 'Codepet.zerostudio')
    if ($packages.Count -ne 1 -or $packages[0].PackageFamilyName -ne $family) { throw 'Expected the installed Zero Studio package.' }
    $receiptPath = [IO.Path]::GetFullPath($Receipt)
    if (Test-Path -LiteralPath $receiptPath) { throw 'Receipt must be a new file.' }
    $logical = Join-Path $env:LOCALAPPDATA 'ZeroStudioStoreData'
    $physical = Join-Path $env:LOCALAPPDATA "Packages\$family\LocalCache\Local\ZeroStudioStoreData"
    $roots = @(@($logical,$physical) | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'editor-opened') -PathType Leaf })
    if ($roots.Count -ne 1) { throw 'Expected one first-run Store editor data root.' }
    $data = $roots[0]; $profile = Join-Path $data 'editor\user-data'; $extensions = Join-Path $data 'editor\extensions'
    $profilePatterns = @($profile,(Join-Path $logical 'editor\user-data')) | Select-Object -Unique
    $pattern = ($profilePatterns | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $running = @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object { $_.CommandLine -match ('(?:^|\s)"?--user-data-dir"?(?:=|\s+)"?(?:' + $pattern + ')"?(?:\s|$)') -and $_.CommandLine -notmatch '--type=' })
    if ($running.Count -gt 1) { throw 'Multiple Zero editor processes found.' }
    if ($running.Count -eq 1) { $exe=$running[0].ExecutablePath; Stop-Process -Id $running[0].ProcessId; Wait-Process -Id $running[0].ProcessId -Timeout 30 -ErrorAction SilentlyContinue }
    else {
        $editors = @(Get-ChildItem -LiteralPath (Join-Path $data 'runtime') -Directory -Filter 'vscode-*' | Get-ChildItem -File -Filter 'Code.exe' -Recurse)
        if ($editors.Count -ne 1) { throw 'Installed Zero editor could not be identified.' }
        $exe=$editors[0].FullName
    }
    $settings = Get-Content -LiteralPath (Join-Path $profile 'User\settings.json') -Raw | ConvertFrom-Json
    $java = @($settings.'java.configuration.runtimes' | Where-Object { $_.name -eq 'JavaSE-21' -and $_.default })[0].path
    if ($java.StartsWith($logical + '\',[StringComparison]::OrdinalIgnoreCase)) { $java=Join-Path $data $java.Substring($logical.Length).TrimStart('\') }
    if (-not $java.StartsWith((Join-Path $data 'runtime\jdk-'),[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path (Join-Path $java 'bin\java.exe'))) { throw 'Private Java runtime missing.' }
    $node = @(Get-ChildItem -LiteralPath (Join-Path $data 'runtime') -Directory -Filter 'node-*' | ForEach-Object { Join-Path $_.FullName 'node.exe' } | Where-Object { Test-Path -LiteralPath $_ })
    if ($node.Count -ne 1) { throw 'Private Node runtime missing.' }
    $kit=Join-Path $env:USERPROFILE 'Zero Studio'
    if (-not (Test-Path (Join-Path $kit 'setup\windows-downloads.json'))) { throw 'Installed Store kit missing.' }
    function Join-ProcessArguments([string[]] $Values) { return (($Values | ForEach-Object { if ($_ -match '["
]') { throw 'Invalid fixture process argument.' }; '"' + $_ + '"' }) -join ' ') }
    function Free-Port { $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0); $listener.Start(); try { return $listener.LocalEndpoint.Port } finally { $listener.Stop() } }
    $editorPort=Free-Port; $chromePort=Free-Port
    $scratch=Join-Path $env:RUNNER_TEMP ('zero-jam-qa-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $scratch | Out-Null
    $stage='editor'
    $launch=[Diagnostics.ProcessStartInfo]::new($exe); $launch.UseShellExecute=$false
    $launch.Arguments = Join-ProcessArguments @('--user-data-dir',$profile,'--extensions-dir',$extensions,'--new-window','--force-renderer-accessibility',"--remote-debugging-port=$editorPort")
    $launch.EnvironmentVariables['ZERO_WINDOWS_DISTRIBUTION']='store'; $launch.EnvironmentVariables['ZERO_KIT_DIR']=$kit
    $launch.EnvironmentVariables['JAVA_HOME']=$java; $launch.EnvironmentVariables['ZERO_JAVA_HOME']=$java; $launch.EnvironmentVariables['ZERO_NODE_EXECUTABLE']=$node[0]; $launch.EnvironmentVariables['MAVEN_SKIP_RC']='1'
    foreach ($key in @('NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE','VSCODE_IPC_HOOK_CLI','GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')) { $null=$launch.EnvironmentVariables.Remove($key) }
    $editor=[Diagnostics.Process]::Start($launch)
    $stage='browser'
    $chrome=@('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $chrome) { throw 'Chrome is unavailable.' }
    $browserLaunch=[Diagnostics.ProcessStartInfo]::new($chrome); $browserLaunch.UseShellExecute=$false
    $browserLaunch.Arguments = Join-ProcessArguments @("--user-data-dir=$scratch\chrome","--remote-debugging-port=$chromePort",'--no-first-run','--no-default-browser-check','--force-renderer-accessibility','about:blank')
    $browser=[Diagnostics.Process]::Start($browserLaunch)
    foreach ($port in @($editorPort,$chromePort)) {
        $ready=$false; for($i=0;$i -lt 60 -and -not $ready;$i++) { try { $null=Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 2; $ready=$true } catch { Start-Sleep -Seconds 1 } }
        if (-not $ready) { throw 'Debugging endpoint did not become ready.' }
    }
    Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes
    $stage='browser-click-and-review'
    $env:ZERO_JAM_PAGE=$PageUrl; $env:ZERO_JAM_ID=$JamId; $env:ZERO_JAM_TITLE=$ExpectedTitle; $env:ZERO_JAM_RULES=$ExpectedRules
    $env:ZERO_JAM_EDITOR_PORT="$editorPort"; $env:ZERO_JAM_CHROME_PORT="$chromePort"
    $driverLaunch=[Diagnostics.ProcessStartInfo]::new($node[0])
    $driverLaunch.UseShellExecute=$false
    $driverLaunch.WorkingDirectory=(Split-Path -Parent $PSScriptRoot)
    $driverLaunch.Arguments=Join-ProcessArguments @((Join-Path $PSScriptRoot 'test-windows-jam-link.mjs'))
    $driverLaunch.RedirectStandardOutput=$true
    $driverLaunch.RedirectStandardError=$true
    $driver=[Diagnostics.Process]::Start($driverLaunch)
    $stdoutTask=$driver.StandardOutput.ReadToEndAsync()
    $stderrTask=$driver.StandardError.ReadToEndAsync()
    $promptInvoked=$false
    $deadline=[DateTime]::UtcNow.AddSeconds(205)
    while (-not $driver.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        # Chrome's OS protocol confirmation is accepted only in our test browser.
        $root=[System.Windows.Automation.AutomationElement]::RootElement
        foreach ($window in $root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)) {
            $pidValue=$window.Current.ProcessId
            $proc=Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
            if (-not $proc -or $proc.Name -ne 'chrome.exe' -or $proc.CommandLine -notlike "*$scratch*") { continue }
            $elements=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
            $names=@($elements | ForEach-Object { $_.Current.Name })
            if (($names -join ' ') -notmatch '(?i)zero') { continue }
            foreach($element in $elements) {
                if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button -or $element.Current.Name -notmatch '^(?i:Open Zero|Open Zero Studio)$') { continue }
                $patternValue=$null
                if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$patternValue)) { $patternValue.Invoke(); $promptInvoked=$true; break }
            }
        }
        Start-Sleep -Milliseconds 500; $driver.Refresh()
    }
    if (-not $driver.HasExited) { $driver.Kill() }
    $driver.WaitForExit()
    $summary=($stdoutTask.GetAwaiter().GetResult() + $stderrTask.GetAwaiter().GetResult()).Replace($env:USERPROFILE,'<user>').Replace($env:RUNNER_TEMP,'<temp>')
    Write-Host "Chrome prompt approved by UI Automation: $promptInvoked"
    Write-Host $summary
    if ($driver.ExitCode -ne 0) { throw "Browser-to-editor check exited with code $($driver.ExitCode)." }
    $result='passed'; $stage='complete'
} catch { $failure=$_; Write-Warning (("Jam link check failed at stage ${stage}: " + $_.Exception.Message).Replace($env:USERPROFILE,'<user>').Replace($env:RUNNER_TEMP,'<temp>')) }
finally {
    foreach ($process in @($driver,$browser,$editor)) { if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } }
    foreach ($name in @('ZERO_JAM_PAGE','ZERO_JAM_ID','ZERO_JAM_TITLE','ZERO_JAM_RULES','ZERO_JAM_EDITOR_PORT','ZERO_JAM_CHROME_PORT')) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
    if ($scratch -and (Test-Path -LiteralPath $scratch)) { Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue }
    if (Get-Variable receiptPath -ErrorAction SilentlyContinue) {
        $receiptData=[ordered]@{schema=1;result=$result;stage=$stage;packageFamily=$family;jamId=$JamId;method='actual browser click and installed isolated editor';sessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId;limits=@('Disposable self-signed MSIX; not Store-signed or physical-device acceptance.','No sign-in, registration or submission performed.')}
        [IO.File]::WriteAllText($receiptPath,($receiptData | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    }
}
if ($failure) { throw "Jam link check failed at stage $stage." }
