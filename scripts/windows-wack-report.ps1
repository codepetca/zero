# Interpret the native WACK XML, not process exit status alone. Unknown formats fail closed.
function Assert-WackReport {
    param([Parameter(Mandatory)][string] $Path, [Parameter(Mandatory)][int] $ExitCode,
        [Parameter(Mandatory)][string] $Identity, [Parameter(Mandatory)][string] $Version)
    if ($ExitCode -ne 0) { throw 'WACK test process failed.' }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'WACK XML report is missing.' }
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $settings.MaxCharactersInDocument = 50MB
    $reader = [Xml.XmlReader]::Create($Path, $settings)
    try { $document = [Xml.XmlDocument]::new(); $document.XmlResolver = $null; $document.Load($reader) }
    finally { $reader.Dispose() }
    $root = $document.DocumentElement
    if (-not $root -or $root.Name -cne 'REPORT' -or
        $root.GetAttribute('OVERALL_RESULT') -cne 'PASS' -or
        $root.GetAttribute('PARTIAL_RUN') -cne 'FALSE' -or
        $root.GetAttribute('APP_NAME') -cne $Identity -or
        $root.GetAttribute('APP_VERSION') -cne $Version -or
        [string]::IsNullOrWhiteSpace($root.GetAttribute('VERSION')) -or
        [string]::IsNullOrWhiteSpace($root.GetAttribute('VALIDATION_TYPE'))) {
        throw 'WACK report is incomplete, failed, unknown, or does not identify the tested package.'
    }
    $tests = @($root.SelectNodes('REQUIREMENTS/REQUIREMENT/TEST'))
    if ($tests.Count -eq 0) { throw 'WACK report contains no test results.' }
    $requiredCount = 0
    foreach ($test in $tests) {
        $results = @($test.SelectNodes('RESULT'))
        if ($results.Count -ne 1) { throw 'WACK test result is missing or ambiguous.' }
        $testResult = $results[0].InnerText.Trim()
        $optional = $test.GetAttribute('OPTIONAL')
        if ($optional -notin @('', 'FALSE', 'TRUE')) { throw 'Unknown WACK optional test value.' }
        if ($optional -cne 'TRUE') {
            $requiredCount++
            if ($testResult -cne 'PASS') { throw 'Required WACK test did not pass.' }
        } elseif ($testResult -cnotin @('PASS', 'FAIL', 'WARNING')) {
            throw 'Unknown optional WACK test result.'
        }
    }
    if ($requiredCount -eq 0) { throw 'WACK report contains no required tests.' }
    return $root.GetAttribute('VERSION')
}
