@echo off
setlocal
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

cd /d "%PROJECT_ROOT%\"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows\install-playbook-governance.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
