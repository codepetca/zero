# Shared GUI evidence for disposable-runner first-run and upgrade diagnostics.
# Marker files, extension manifests and Code.exe CLI processes alone are insufficient.
function Update-ZeroEditorWindowProof {
    param([hashtable]$State, [object[]]$Processes, [object[]]$Windows,
          [string[]]$ProfilePaths, [datetime]$Started, [datetime]$Now)
    $candidate = $null
    foreach ($process in $Processes) {
        if ($process.CreatedAt -lt $Started -or -not $process.CommandLine -or
            $process.WindowHandle -eq 0 -or [string]::IsNullOrWhiteSpace($process.WindowTitle)) { continue }
        $matchesProfile = $false
        foreach ($profile in $ProfilePaths) {
            $escapedProfile = [regex]::Escape($profile)
            if ($process.CommandLine -match ('(?:^|\s)"?--user-data-dir"?(?:=|\s+)(?:"' + $escapedProfile + '"|' + $escapedProfile + ')(?:\s|$)')) { $matchesProfile = $true }
        }
        if (-not $matchesProfile) { continue }
        $visible = @($Windows | Where-Object {
            $_.ProcessId -eq $process.ProcessId -and $_.WindowHandle -eq $process.WindowHandle -and
            -not $_.IsOffscreen -and -not [string]::IsNullOrWhiteSpace($_.Name)
        })
        if ($visible.Count -gt 0) { $candidate = $process; break }
    }
    if (-not $candidate) { $State.Clear(); return $false }
    if ($State['ProcessId'] -ne $candidate.ProcessId -or $State['WindowHandle'] -ne $candidate.WindowHandle) {
        $State['ProcessId'] = $candidate.ProcessId; $State['WindowHandle'] = $candidate.WindowHandle; $State['Since'] = $Now
    }
    return ($Now - $State['Since']).TotalSeconds -ge 3
}
function Get-ZeroEditorWindowProof {
    param([hashtable]$State, [string[]]$ProfilePaths, [datetime]$Started, [object[]]$Windows)
    $processes = @(
        foreach ($item in @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'")) {
            $process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
            if (-not $process) { continue }
            [pscustomobject]@{
                ProcessId = $item.ProcessId; CreatedAt = $item.CreationDate.ToUniversalTime(); CommandLine = $item.CommandLine
                WindowHandle = $process.MainWindowHandle.ToInt64(); WindowTitle = $process.MainWindowTitle
            }
        }
    )
    $windowSnapshots = @(
        foreach ($window in $Windows) {
            [pscustomobject]@{
                ProcessId = $window.Current.ProcessId; WindowHandle = $window.Current.NativeWindowHandle
                IsOffscreen = $window.Current.IsOffscreen; Name = $window.Current.Name
            }
        }
    )
    Update-ZeroEditorWindowProof -State $State -Processes $processes -Windows $windowSnapshots -ProfilePaths $ProfilePaths -Started $Started -Now ([datetime]::UtcNow)
}
