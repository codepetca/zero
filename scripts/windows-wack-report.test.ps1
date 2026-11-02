$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-wack-report.ps1')
$dir = Join-Path ([IO.Path]::GetTempPath()) ('zero-wack-unit-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
try {
    $path = Join-Path $dir 'report.xml'
    $fixture = Join-Path $PSScriptRoot 'fixtures/wack-centennial-sanitized.xml'
    $identity = 'Codepet.zerostudio'; $version = '1.5.56.0'; $publisher = 'CN=DC9AEBC0-4CAE-4681-9E52-20B0B1C14919'
    $fullName = 'Codepet.zerostudio_1.5.56.0_x64__g62pw1js6rhjp'
    function Summary($Document) { Get-WackReportSummary -Document $Document -Identity $identity -Version $version -Publisher $publisher -Architecture 'x64' -PackageFullName $fullName }
    function Expect-Failure([string] $Label, $Document, [int] $ExitCode) {
        $failed = $false
        try { Assert-WackReport -Document $Document -Summary (Summary $Document) -ExitCode $ExitCode }
        catch { $failed = $true }
        if (-not $failed) { throw "Expected failure: $Label" }
    }
    $real = Read-WackReportDocument $fixture
    $summary = Summary $real
    if (-not $summary.matchedIdentity -or $summary.overallResult -cne 'WARNING' -or $summary.testCount -ne 24 -or $summary.nonPassingTests.Count -ne 2) { throw 'Real fixture summary mismatch.' }
    Expect-Failure 'real warning is not a clean pass' $real 0
    $valid = Read-WackReportDocument $fixture
    $valid.DocumentElement.SetAttribute('OVERALL_RESULT','PASS')
    $valid.SelectSingleNode("//TEST[@NAME='DPIAwarenessValidation']/RESULT").InnerText = 'PASS'
    Assert-WackReport -Document $valid -Summary (Summary $valid) -ExitCode 0
    $optionalOnly = [xml]$valid.OuterXml
    $optionalOnly.DocumentElement.SetAttribute('OVERALL_RESULT','WARNING')
    Assert-WackReport -Document $optionalOnly -Summary (Summary $optionalOnly) -ExitCode 0
    $unexplained = [xml]$optionalOnly.OuterXml
    foreach ($result in $unexplained.SelectNodes('//TEST/RESULT')) { $result.InnerText = 'PASS' }
    Expect-Failure 'unexplained overall warning' $unexplained 0
    $requiredWarning = [xml]$valid.OuterXml
    $requiredWarning.DocumentElement.SetAttribute('OVERALL_RESULT','WARNING')
    $requiredWarning.SelectSingleNode("//TEST[@NAME='DPIAwarenessValidation']/RESULT").InnerText = 'WARNING'
    Expect-Failure 'required warning remains blocked' $requiredWarning 0
    Expect-Failure 'nonzero exit' $valid 1
    foreach ($attribute in @('PackageFullName', 'Name', 'Publisher', 'Version', 'ProcessorArchitecture')) {
        $copy = [xml]$valid.OuterXml
        $node = if ($attribute -eq 'PackageFullName') { $copy.SelectSingleNode('//PackageManifest') } else { $copy.SelectSingleNode('//PackageManifest/Package/Identity') }
        $node.SetAttribute($attribute, 'different')
        Expect-Failure "mismatched $attribute" $copy 0
    }
    foreach ($attribute in @('APP_NAME', 'APP_VERSION')) {
        $copy = [xml]$valid.OuterXml; $copy.DocumentElement.SetAttribute($attribute, 'different')
        Expect-Failure "mismatched root $attribute" $copy 0
    }
    $copy = [xml]$valid.OuterXml; $copy.DocumentElement.RemoveAttribute('VALIDATION_TYPE')
    Expect-Failure 'interim report' $copy 0
    $copy = [xml]$valid.OuterXml; $copy.DocumentElement.SetAttribute('PARTIAL_RUN', 'TRUE')
    Expect-Failure 'partial run' $copy 0
    $copy = [xml]$valid.OuterXml; $copy.DocumentElement.RemoveChild($copy.SelectSingleNode('/REPORT/REQUIREMENTS')) | Out-Null
    Expect-Failure 'no tests' $copy 0
    $copy = [xml]$valid.OuterXml; $copy.SelectSingleNode("//TEST[@NAME='DPIAwarenessValidation']/RESULT").InnerText = 'FAIL'
    Expect-Failure 'required failure' $copy 0
    [IO.File]::WriteAllText($path, '<REPORT')
    try { Read-WackReportDocument $path | Out-Null; throw 'Malformed report accepted.' } catch { if ($_.Exception.Message -eq 'Malformed report accepted.') { throw } }
    Remove-Item -LiteralPath $path
    try { Read-WackReportDocument $path | Out-Null; throw 'Missing report accepted.' } catch { if ($_.Exception.Message -eq 'Missing report accepted.') { throw } }
    Write-Output 'WACK report tests passed.'
} finally { Remove-Item -LiteralPath $dir -Recurse -Force }
