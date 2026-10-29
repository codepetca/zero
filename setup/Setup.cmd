@echo off
setlocal
rem Checks never prompt for a policy exception or change policy.
if "%~1"=="--check" goto check
echo Zero guided setup
echo 1 Run using your normal PowerShell policy
echo 2 Allow this local kit script for ONE PowerShell process only
echo   Choose 2 only for a trusted Zero kit and where your school permits it.
echo   This does not change saved policy or bypass an enforced school policy.
echo 0 Exit
choice /c 120 /n /m "Choose 1, 2 or 0: "
if errorlevel 3 exit /b 0
if errorlevel 2 goto once
goto normal
:once
set "policy_status=UNKNOWN"
for /f "delims=" %%P in ('powershell.exe -NoLogo -NoProfile -Command "if ((Get-ExecutionPolicy -Scope MachinePolicy) -eq 'Undefined' -and (Get-ExecutionPolicy -Scope UserPolicy) -eq 'Undefined') { 'UNMANAGED' } else { 'MANAGED' }"') do set "policy_status=%%P"
if not "%policy_status%"=="UNMANAGED" (
  echo A managed school policy is present, or policy could not be checked.
  echo Setup will not request a process exception. Ask your device administrator or IT.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1"
goto finish
:normal
powershell.exe -NoLogo -NoProfile -File "%~dp0Setup.ps1" %*
goto finish
:check
powershell.exe -NoLogo -NoProfile -File "%~dp0Setup.ps1" -Check
exit /b %errorlevel%
:finish
set "setup_result=%errorlevel%"
echo.
echo If school policy blocked setup, ask your device administrator or IT. See setup\README.md.
pause
exit /b %setup_result%
