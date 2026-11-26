[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputDirectory,
    [ValidateSet('All', 'Prepare', 'Interactive')][string]$Phase = 'All'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Use a disposable GitHub-hosted Windows runner.'
}
$package = Get-AppxPackage -Name Codepet.zerostudio
if ($package.PackageFullName -ne 'Codepet.zerostudio_1.5.89.0_x64__g62pw1js6rhjp') {
    throw 'The exact 0.5.89 package identity is required.'
}
if ($package.SignatureKind -ne 'Store') {
    throw 'The public proof requires the Microsoft Store signature.'
}
$project = Join-Path $OutputDirectory 'zero-collision-check'
$null = New-Item -ItemType Directory -Path $OutputDirectory
git clone --branch main --single-branch https://github.com/codepetca/zero-starter.git $project
if ($LASTEXITCODE -ne 0) { throw 'Could not clone the public starter.' }
$tree = (git -C $project rev-parse 'HEAD^{tree}').Trim()
if ($tree -ne '0711c0c4ace8ba33459037ea675a483327bc7264') { throw 'The public starter does not match the reviewed refresh.' }
$driver = Join-Path $PSScriptRoot 'public-store-collision-editor.mjs'
function Invoke-Exercise([string]$Action) {
    node $driver $Action $project $OutputDirectory
    if ($LASTEXITCODE -ne 0) { throw "Installed editor action failed: $Action." }
}
if ($Phase -in 'Prepare','Interactive') { $env:ZERO_PROOF_INTERACTIVE = 'true' }
Invoke-Exercise lesson

$logical = Join-Path $env:LOCALAPPDATA 'ZeroStudioStoreData'
$physical = Join-Path $env:LOCALAPPDATA ('Packages\' + $package.PackageFamilyName + '\LocalCache\Local\ZeroStudioStoreData')
$roots = @($physical, $logical) | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'editor-opened') -PathType Leaf }
if (@($roots).Count -ne 1) { throw 'Expected a single Store-provisioned editor root.' }
$data = @($roots)[0]
$profile = Join-Path $data 'editor\user-data'
$extensions = Join-Path $data 'editor\extensions'
$extensionManifest = Get-Content -LiteralPath (Join-Path $extensions 'zero.zero-0.5.89\package.json') -Raw | ConvertFrom-Json
if ($extensionManifest.version -ne '0.5.89') { throw 'The installed editor extension has the wrong version.' }

# Restart only the Store-provisioned isolated editor with its own profile and tools.
$profilePaths = @($profile, (Join-Path $logical 'editor\user-data')) | Select-Object -Unique
$profileExpression = ($profilePaths | ForEach-Object { [regex]::Escape($_) }) -join '|'
$isolated = @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" | Where-Object {
    $_.CommandLine -match ('(?:^|\s)"?--user-data-dir"?(?:=|\s+)"?(?:' + $profileExpression + ')"?(?:\s|$)') -and
    $_.CommandLine -notmatch '--type='
})
if ($isolated.Count -eq 1 -and (Test-Path -LiteralPath $isolated[0].ExecutablePath -PathType Leaf)) {
    $editorProgram = $isolated[0].ExecutablePath
    Stop-Process -Id $isolated[0].ProcessId
} elseif ($isolated.Count -eq 0 -and $Phase -eq 'Interactive') {
    $runtime = Join-Path $data 'runtime'
    $editorPaths = @(Get-ChildItem -LiteralPath $runtime -Directory -Filter 'vscode-*' |
        Get-ChildItem -File -Filter 'Code.exe' -Recurse)
    if ($editorPaths.Count -ne 1) { throw 'The Store-installed editor could not be located.' }
    $editorProgram = $editorPaths[0].FullName
} else {
    throw 'Expected one installed editor process using the exact Store profile.'
}
$settingsPath = Join-Path $profile 'User\settings.json'
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json -AsHashtable
$settings['window.dialogStyle'] = 'custom'
$settings['security.workspace.trust.startupPrompt'] = 'always'
[IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json -Depth 30))
$privateJava = @($settings['java.configuration.runtimes'] | Where-Object { $_.name -eq 'JavaSE-21' -and $_.default })[0].path
if ($privateJava.StartsWith($logical + '\', [StringComparison]::OrdinalIgnoreCase)) {
    $privateJava = Join-Path $data $privateJava.Substring($logical.Length).TrimStart('\')
}
if (-not $privateJava.StartsWith((Join-Path $data 'runtime\jdk-'), [StringComparison]::OrdinalIgnoreCase) -or
    -not (Test-Path -LiteralPath (Join-Path $privateJava 'bin\java.exe'))) { throw 'Expected the Store-provisioned JDK.' }
# This plain Java check uses the private JDK installed by the Store package.
# The separate editor exercise below still goes through Zero's sign-in and picker.
node (Join-Path $PSScriptRoot 'verify-store-jdk-collision.mjs') (Join-Path $privateJava 'bin') $project $OutputDirectory
if ($LASTEXITCODE -ne 0) { throw 'Collision Helper failed under the Store-provisioned JDK.' }
$nodeRuntime = @(Get-ChildItem -LiteralPath (Join-Path $data 'runtime') -Directory -Filter 'node-*' | ForEach-Object {
    Join-Path $_.FullName 'node.exe'
} | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($nodeRuntime.Count -ne 1) { throw 'Expected one private Node runtime.' }
$kit = Join-Path $env:USERPROFILE 'Zero Studio'
if (-not (Test-Path -LiteralPath (Join-Path $kit 'setup\windows-downloads.json'))) { throw 'The installed Store kit is missing.' }

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$env:ZERO_PROOF_EDITOR_PORT = $listener.LocalEndpoint.Port.ToString()
$listener.Stop()
$launch = [Diagnostics.ProcessStartInfo]::new($editorProgram)
$launch.UseShellExecute = $false
foreach ($arg in @('--user-data-dir', $profile, '--extensions-dir', $extensions, '--new-window',
    "--remote-debugging-port=$env:ZERO_PROOF_EDITOR_PORT", $project)) { $launch.ArgumentList.Add($arg) }
$launch.Environment['ZERO_WINDOWS_DISTRIBUTION'] = 'store'
$launch.Environment['ZERO_KIT_DIR'] = $kit
$launch.Environment['JAVA_HOME'] = $privateJava
$launch.Environment['ZERO_JAVA_HOME'] = $privateJava
$launch.Environment['ZERO_NODE_EXECUTABLE'] = $nodeRuntime[0]
$git = $settings['git.path']
if ($git.StartsWith($logical + '\', [StringComparison]::OrdinalIgnoreCase)) {
    $git = Join-Path $data $git.Substring($logical.Length).TrimStart('\')
}
$launch.Environment['ZERO_GIT_EXECUTABLE'] = $git
$launch.Environment['MAVEN_SKIP_RC'] = '1'
$launch.Environment['PATH'] = (Join-Path $privateJava 'bin') + ';' + $env:Path
foreach ($key in @('NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE','GIT_CONFIG_COUNT','GIT_CONFIG_PARAMETERS','VSCODE_IPC_HOOK_CLI','GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')) {
    $null = $launch.Environment.Remove($key)
}
$editor = [Diagnostics.Process]::Start($launch)
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 45 -and -not $ready; $attempt++) {
        $targets = curl.exe --silent --fail --max-time 2 "http://127.0.0.1:$env:ZERO_PROOF_EDITOR_PORT/json/list"
        if ($LASTEXITCODE -eq 0) {
            $ready = [bool](($targets | ConvertFrom-Json) | Where-Object { $_.type -eq 'page' -and $_.title -like '*zero-collision-check*' })
        }
        if (-not $ready) { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw 'The installed isolated editor did not open the test project.' }
    if ($Phase -in 'Prepare','Interactive') {
        Invoke-Exercise stage-sign-in
        if ($Phase -eq 'Prepare') { return }
        Invoke-Exercise wait-for-sign-in
    }
    Invoke-Exercise add
    Invoke-Exercise run

    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $label = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::NameProperty, 'Collision Helper Pilot works')
    $nativePassed = $false
    for ($attempt = 0; $attempt -lt 90 -and -not $nativePassed; $attempt++) {
        $javaProcesses = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object {
            $_.CommandLine -like "*$project*" -and $_.CommandLine -like '*--module-path*'
        })
        $javaProcessIds = @($javaProcesses | Select-Object -ExpandProperty ProcessId)
        foreach ($window in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
            if ($window.Current.ProcessId -in $javaProcessIds -and -not $window.Current.IsOffscreen -and
                $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $label)) { $nativePassed = $true; break }
        }
        if (-not $nativePassed) { Start-Sleep -Seconds 2 }
    }
    if (-not $nativePassed) { throw 'The native JavaFX window did not show the expected label.' }
    Invoke-Exercise stop
    Invoke-Exercise export
    Invoke-Exercise update-browser
    $index = Join-Path $project '.zero\web-export\site\index.html'
    for ($attempt = 0; $attempt -lt 120 -and -not (Test-Path -LiteralPath $index); $attempt++) { Start-Sleep -Seconds 2 }
    if (-not (Test-Path -LiteralPath $index)) { throw 'The installed editor did not export the lesson for WebFX.' }
    Invoke-Exercise preview
    $previewDriver = Join-Path $PSScriptRoot 'public-store-collision-preview.mjs'
    if ($Phase -eq 'Interactive') { node $previewDriver }
    else { node $previewDriver (Join-Path $OutputDirectory 'public-browser-preview.png') }
    if ($LASTEXITCODE -ne 0) { throw 'The installed WebFX preview did not show the expected label.' }
    [pscustomobject]@{
        packageFullName = $package.PackageFullName
        signature = $package.SignatureKind.ToString()
        acquisition = 'public Microsoft Store'
        starterTree = $tree
        library = 'Collision Helper Pilot 0.2.0'
        native = 'Collision Helper Pilot works'
        webfx = 'Collision Helper Pilot works'
    } | ConvertTo-Json | Set-Content (Join-Path $OutputDirectory 'collision-result.json')
} finally {
    if (-not $editor.HasExited) { Stop-Process -Id $editor.Id }
}
