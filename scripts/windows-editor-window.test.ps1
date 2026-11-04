Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-editor-window.ps1')
$started = [datetime]'2026-11-04T12:00:00Z'
$profile = 'C:\Users\fixture\AppData\Local\ZeroStudioStoreData\editor\user-data'
$state = @{}
function Process-Snapshot([int]$Id = 20, [long]$Handle = 100, [string]$Title = 'Main.java - Zero', [string]$Command = ('Code.exe --user-data-dir "' + $profile + '"'), [datetime]$Created = $started.AddSeconds(1)) {
    [pscustomobject]@{ ProcessId = $Id; WindowHandle = $Handle; WindowTitle = $Title; CommandLine = $Command; CreatedAt = $Created }
}
function Window-Snapshot([int]$Id = 20, [long]$Handle = 100, [bool]$Offscreen = $false, [string]$Name = 'Main.java - Zero') {
    [pscustomobject]@{ ProcessId = $Id; WindowHandle = $Handle; IsOffscreen = $Offscreen; Name = $Name }
}
function Expect([bool]$Value, [string]$Label) { if (-not $Value) { throw $Label } }
function Observe([int]$Seconds, [object[]]$Processes, [object[]]$Windows) {
    Update-ZeroEditorWindowProof -State $state -Processes $Processes -Windows $Windows -ProfilePaths @($profile) -Started $started -Now $started.AddSeconds($Seconds)
}
# A CLI process can have the correct profile/start time without opening a window.
Expect (-not (Observe 1 @((Process-Snapshot -Handle 0 -Title '')) @())) 'CLI-only process accepted'
Expect (-not (Observe 10 @((Process-Snapshot -Handle 0 -Title '')) @())) 'CLI persistence accepted'
Expect (-not (Observe 11 @((Process-Snapshot)) @((Window-Snapshot -Offscreen $true)))) 'offscreen window accepted'
Expect (-not (Observe 12 @((Process-Snapshot -Command 'Code.exe --user-data-dir C:\other')) @((Window-Snapshot)))) 'wrong profile accepted'
Expect (-not (Observe 13 @((Process-Snapshot -Created $started.AddSeconds(-1))) @((Window-Snapshot)))) 'preexisting editor accepted'
Expect (-not (Observe 14 @((Process-Snapshot)) @((Window-Snapshot -Id 30)))) 'unrelated process window accepted'
Expect (-not (Observe 15 @((Process-Snapshot)) @((Window-Snapshot -Handle 200)))) 'different window handle accepted'
Expect (-not (Observe 16 @((Process-Snapshot -Title '')) @((Window-Snapshot)))) 'untitled process accepted'
Expect (-not (Observe 17 @((Process-Snapshot)) @((Window-Snapshot -Name '')))) 'unnamed UIA window accepted'
Expect (-not (Observe 18 @((Process-Snapshot -Command ('Code.exe --user-data-dir "' + $profile + '-other"'))) @((Window-Snapshot)))) 'profile prefix accepted'
Expect (-not (Observe 19 @((Process-Snapshot -Command ('Code.exe "' + $profile + '"'))) @((Window-Snapshot)))) 'positional path accepted as profile'
Expect (-not (Observe 20 @((Process-Snapshot)) @((Window-Snapshot)))) 'first observation already stable'
Expect (-not (Observe 22 @((Process-Snapshot)) @((Window-Snapshot)))) 'window stable before three seconds'
Expect (Observe 23 @((Process-Snapshot)) @((Window-Snapshot))) 'stable visible window rejected'
Expect (-not (Observe 24 @() @())) 'missing window accepted'
Expect (-not (Observe 30 @((Process-Snapshot)) @((Window-Snapshot)))) 'disappearance failed to reset stability'
Expect (Observe 33 @((Process-Snapshot)) @((Window-Snapshot))) 'restored stable window rejected'
Expect (-not (Observe 34 @((Process-Snapshot -Handle 200)) @((Window-Snapshot -Handle 200)))) 'new handle failed to reset stability'
Expect (Observe 37 @((Process-Snapshot -Handle 200)) @((Window-Snapshot -Handle 200))) 'replacement stable handle rejected'
Expect (-not (Observe 38 @((Process-Snapshot -Id 30 -Handle 200)) @((Window-Snapshot -Id 30 -Handle 200)))) 'new process failed to reset stability'
Expect (Observe 41 @((Process-Snapshot -Id 30 -Handle 200)) @((Window-Snapshot -Id 30 -Handle 200))) 'replacement stable process rejected'
Write-Output 'Editor window proof: 21 assertions passed.'
