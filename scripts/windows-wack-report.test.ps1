$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-wack-report.ps1')
$dir = Join-Path ([IO.Path]::GetTempPath()) ('zero-wack-unit-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
try {
    $path = Join-Path $dir 'report.xml'
    $valid = '<REPORT OVERALL_RESULT="PASS" PARTIAL_RUN="FALSE" APP_NAME="Codepet.zerostudio" APP_VERSION="1.2.3.0" VERSION="10.0.26100.1" VALIDATION_TYPE="UI"><REQUIREMENTS><REQUIREMENT><TEST NAME="Test"><RESULT>PASS</RESULT></TEST></REQUIREMENT></REQUIREMENTS></REPORT>'
    function Expect-Failure([string] $Label, [AllowNull()][object] $Content, [int] $ExitCode) {
        if ($null -ne $Content) { [IO.File]::WriteAllText($path, $Content) }
        elseif (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
        $failed = $false
        try { Assert-WackReport -Path $path -ExitCode $ExitCode -Identity 'Codepet.zerostudio' -Version '1.2.3.0' | Out-Null }
        catch { $failed = $true }
        if (-not $failed) { throw "Expected failure: $Label" }
    }
    [IO.File]::WriteAllText($path, $valid)
    if ((Assert-WackReport -Path $path -ExitCode 0 -Identity 'Codepet.zerostudio' -Version '1.2.3.0') -ne '10.0.26100.1') { throw 'Pass result rejected.' }
    Expect-Failure 'interim report' $valid.Replace(' VALIDATION_TYPE="UI"', '') 0
    Expect-Failure 'empty completion marker' $valid.Replace('VALIDATION_TYPE="UI"', 'VALIDATION_TYPE=""') 0
    Expect-Failure 'no tests' $valid.Replace('<REQUIREMENTS><REQUIREMENT><TEST NAME="Test"><RESULT>PASS</RESULT></TEST></REQUIREMENT></REQUIREMENTS>', '') 0
    Expect-Failure 'required test failure' $valid.Replace('<RESULT>PASS</RESULT>', '<RESULT>FAIL</RESULT>') 0
    Expect-Failure 'missing test result' $valid.Replace('<RESULT>PASS</RESULT>', '') 0
    $optionalFailure = $valid.Replace('</REQUIREMENT>', '<TEST NAME="Optional" OPTIONAL="TRUE"><RESULT>FAIL</RESULT></TEST></REQUIREMENT>')
    [IO.File]::WriteAllText($path, $optionalFailure)
    Assert-WackReport -Path $path -ExitCode 0 -Identity 'Codepet.zerostudio' -Version '1.2.3.0' | Out-Null
    Expect-Failure 'failed overall' $valid.Replace('OVERALL_RESULT="PASS"', 'OVERALL_RESULT="FAIL"') 0
    Expect-Failure 'partial run' $valid.Replace('PARTIAL_RUN="FALSE"', 'PARTIAL_RUN="TRUE"') 0
    Expect-Failure 'different package' $valid.Replace('Codepet.zerostudio', 'Other.App') 0
    Expect-Failure 'unknown result' $valid.Replace('OVERALL_RESULT="PASS"', 'OVERALL_RESULT="WARNING"') 0
    Expect-Failure 'malformed' '<REPORT' 0
    Expect-Failure 'missing' $null 0
    Expect-Failure 'nonzero exit' $valid 1
    Write-Output 'WACK report tests passed.'
} finally { Remove-Item -LiteralPath $dir -Recurse -Force }
