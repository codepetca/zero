# Interpret native WACK XML without loading external entities. Unknown formats fail closed.
function Read-WackReportDocument {
    param([Parameter(Mandatory)][string] $Path)
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $settings.MaxCharactersInDocument = 50MB
    $reader = [Xml.XmlReader]::Create($Path, $settings)
    try { $document = [Xml.XmlDocument]::new(); $document.XmlResolver = $null; $document.Load($reader) }
    finally { $reader.Dispose() }
    if (-not $document.DocumentElement -or $document.DocumentElement.Name -cne 'REPORT') { throw 'Unknown WACK report.' }
    return $document
}

function Get-WackReportSummary {
    param([Parameter(Mandatory)][Xml.XmlDocument] $Document, [Parameter(Mandatory)][string] $Identity,
        [Parameter(Mandatory)][string] $Version, [Parameter(Mandatory)][string] $Publisher,
        [Parameter(Mandatory)][string] $Architecture, [Parameter(Mandatory)][string] $PackageFullName)
    $root = $Document.DocumentElement
    $manifests = @($root.SelectNodes('APPLICATIONS/Installed_Programs/Program/Indicators/WindowsStoreAppManifestIndicators/PackageManifest'))
    $matched = $false
    if ($manifests.Count -eq 1) {
        $manifest = $manifests[0]
        $identities = @($manifest.SelectNodes('Package/Identity'))
        if ($identities.Count -eq 1) {
            $item = $identities[0]
            $matched = $manifest.GetAttribute('PackageFullName') -ceq $PackageFullName -and
                $item.GetAttribute('Name') -ceq $Identity -and $item.GetAttribute('Version') -ceq $Version -and
                $item.GetAttribute('Publisher') -ceq $Publisher -and $item.GetAttribute('ProcessorArchitecture') -ieq $Architecture
        }
    }
    $rootName = $root.GetAttribute('APP_NAME'); $rootVersion = $root.GetAttribute('APP_VERSION')
    if (($rootName -and $rootName -cne $Identity) -or ($rootVersion -and $rootVersion -cne $Version) -or
        ((-not $rootName -or -not $rootVersion) -and $root.GetAttribute('APP_TYPE') -cne 'Centennial')) { $matched = $false }
    $tests = @($root.SelectNodes('REQUIREMENTS/REQUIREMENT/TEST'))
    $nonPassing = @(
        foreach ($test in $tests) {
            $results = @($test.SelectNodes('RESULT'))
            $result = if ($results.Count -eq 1) { $results[0].InnerText.Trim() } else { 'UNKNOWN' }
            if ($result -cne 'PASS') {
                # The raw report is retained separately. Do not copy arbitrary WACK
                # message text, which can contain runner paths or user information.
                $messages = @($test.SelectNodes('MESSAGES/MESSAGE') | ForEach-Object { 'Details are in the retained XML report.' })
                $name = $test.GetAttribute('NAME')
                if ($name -cnotmatch '^[A-Za-z0-9 ._-]{1,128}$') { $name = '[redacted]' }
                $optional = $test.GetAttribute('OPTIONAL')
                if ($optional -cnotin @('TRUE', 'FALSE', '')) { $optional = 'UNKNOWN' }
                if ($result -cnotin @('PASS', 'FAIL', 'WARNING')) { $result = 'UNKNOWN' }
                [ordered]@{ name = $name; optional = $optional; result = $result; messages = $messages }
            }
        }
    )
    $overall = $root.GetAttribute('OVERALL_RESULT'); if ($overall -cnotin @('PASS', 'FAIL', 'WARNING')) { $overall = 'UNKNOWN' }
    $kitVersion = $root.GetAttribute('VERSION'); if ($kitVersion -cnotmatch '^\d+(\.\d+){1,3}$') { $kitVersion = '' }
    $validationType = $root.GetAttribute('VALIDATION_TYPE'); if ($validationType -cnotmatch '^[A-Za-z]{1,32}$') { $validationType = '' }
    $partial = $root.GetAttribute('PARTIAL_RUN'); if ($partial -cnotin @('TRUE', 'FALSE')) { $partial = 'UNKNOWN' }
    return [ordered]@{ overallResult = $overall; kitVersion = $kitVersion
        validationType = $validationType; partialRun = $partial
        matchedIdentity = $matched; testCount = $tests.Count; nonPassingTests = $nonPassing }
}

function Assert-WackReport {
    param([Parameter(Mandatory)][Xml.XmlDocument] $Document, [Parameter(Mandatory)][System.Collections.IDictionary] $Summary,
        [Parameter(Mandatory)][int] $ExitCode)
    if ($ExitCode -ne 0) { throw 'WACK test process failed.' }
    if ($Summary.overallResult -cne 'PASS' -or $Summary.partialRun -cne 'FALSE' -or -not $Summary.matchedIdentity -or
        [string]::IsNullOrWhiteSpace($Summary.kitVersion) -or [string]::IsNullOrWhiteSpace($Summary.validationType)) {
        throw 'WACK report is incomplete, failed, unknown, or does not identify the tested package.'
    }
    $tests = @($Document.DocumentElement.SelectNodes('REQUIREMENTS/REQUIREMENT/TEST'))
    if ($tests.Count -eq 0) { throw 'WACK report contains no test results.' }
    $requiredCount = 0
    foreach ($test in $tests) {
        $results = @($test.SelectNodes('RESULT'))
        if ($results.Count -ne 1) { throw 'WACK test result is missing or ambiguous.' }
        $testResult = $results[0].InnerText.Trim()
        $optional = $test.GetAttribute('OPTIONAL')
        if ($optional -cnotin @('', 'FALSE', 'TRUE')) { throw 'Unknown WACK optional test value.' }
        if ($optional -cne 'TRUE') {
            $requiredCount++
            if ($testResult -cne 'PASS') { throw 'Required WACK test did not pass.' }
        } elseif ($testResult -cnotin @('PASS', 'FAIL', 'WARNING')) { throw 'Unknown optional WACK test result.' }
    }
    if ($requiredCount -eq 0) { throw 'WACK report contains no required tests.' }
}
