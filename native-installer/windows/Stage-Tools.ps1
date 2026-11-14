# Run on a staging PC before copying Zero Portable to the approved folder.
param([string] $DownloadDirectory)

$ErrorActionPreference = 'Stop'
$tools = Join-Path $PSScriptRoot 'tools'
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'Zero.exe') -PathType Leaf)) {
    throw 'Extract the complete Zero Portable ZIP before staging tools.'
}
if (Test-Path -LiteralPath $tools) {
    throw 'The tools folder already exists. Use a freshly extracted Zero Portable ZIP.'
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$pins = @'
@TOOL_PINS@
'@ | ConvertFrom-Json

function Get-VerifiedArchive($asset) {
    $file = Join-Path $work $asset.filename
    if ($DownloadDirectory) {
        $file = Join-Path $DownloadDirectory $asset.filename
    } else {
        Write-Host "Downloading $($asset.name)..."
        Invoke-WebRequest -UseBasicParsing -Uri $asset.url -OutFile $file
    }
    $archive = Get-Item -LiteralPath $file
    if ($archive.PSIsContainer -or $archive.Length -ne $asset.size -or
        (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash -ne $asset.sha256) {
        throw "$($asset.name) does not match the pinned download."
    }
    return $archive.FullName
}

# Complete every vendor checksum and extraction in a temporary sibling folder.
$work = Join-Path $PSScriptRoot ('.stage-' + [Guid]::NewGuid().ToString('N'))
$prepared = Join-Path $work 'tools'
New-Item -ItemType Directory -Path $prepared | Out-Null
try {
    foreach ($asset in $pins) {
        $archive = Get-VerifiedArchive $asset
        if ($asset.name -eq 'java') {
            Copy-Item -LiteralPath $archive -Destination (Join-Path $prepared 'java.vsix')
            continue
        }
        $expanded = Join-Path $work ($asset.name + '-expanded')
        [IO.Compression.ZipFile]::ExtractToDirectory($archive, $expanded)
        $content = if ($asset.prefix) { Join-Path $expanded $asset.prefix } else { $expanded }
        if (-not (Test-Path -LiteralPath (Join-Path $content $asset.executable) -PathType Leaf)) {
            throw "$($asset.name) has an unexpected archive layout."
        }
        if ($asset.name -eq 'vscode' -and (Test-Path -LiteralPath (Join-Path $content 'data'))) {
            throw 'The VS Code ZIP contains a shared data folder.'
        }
        [IO.File]::WriteAllText((Join-Path $content '.zero-asset.sha256'), $asset.sha256)
        [IO.Directory]::Move($content, (Join-Path $prepared $asset.name))
    }
    [IO.Directory]::Move($prepared, $tools)
    Write-Host 'Tools staged. Copy the complete Zero Portable folder to the approved location.'
} finally {
    Remove-Item -LiteralPath $work -Force -Recurse
}
