# Run on a staging PC, then have school IT copy the complete folder to the pilot desktop.
param([string] $EditorZip)

$ErrorActionPreference = 'Stop'
$tools = Join-Path $PSScriptRoot 'tools'
$destination = Join-Path $tools 'vscode'
if (-not (Test-Path -LiteralPath (Join-Path $tools 'java.vsix') -PathType Leaf)) {
    throw 'Extract the complete Zero Portable ZIP before staging VS Code.'
}
if (Test-Path -LiteralPath $destination) {
    throw 'A VS Code folder already exists. Use a freshly extracted Zero Portable folder.'
}

$work = Join-Path $tools ('.vscode-stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    if (-not $EditorZip) {
        $EditorZip = Join-Path $work 'vscode.zip'
        Write-Host 'Downloading the pinned VS Code ZIP from Microsoft...'
        Invoke-WebRequest -UseBasicParsing -Uri '@VS_CODE_URL@' -OutFile $EditorZip
    }
    $archive = Get-Item -LiteralPath $EditorZip
    if ($archive.PSIsContainer -or $archive.Length -ne @VS_CODE_SIZE@ -or
        (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash -ne '@VS_CODE_SHA256@') {
        throw 'This ZIP does not match the pinned VS Code download.'
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $expanded = Join-Path $work 'vscode'
    [IO.Compression.ZipFile]::ExtractToDirectory($archive.FullName, $expanded)
    if (-not (Test-Path -LiteralPath (Join-Path $expanded 'Code.exe') -PathType Leaf) -or
        (Test-Path -LiteralPath (Join-Path $expanded 'data'))) {
        throw 'The ZIP is missing Code.exe or contains a shared data folder.'
    }
    [IO.File]::WriteAllText((Join-Path $expanded '.zero-asset.sha256'), '@VS_CODE_SHA256@')
    [IO.Directory]::Move($expanded, $destination)
    Write-Host 'VS Code staged. Copy the complete Zero Portable folder to the approved location.'
} finally {
    Remove-Item -LiteralPath $work -Force -Recurse
}
