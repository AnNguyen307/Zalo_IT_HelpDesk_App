@echo off
setlocal
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

cd /d "%PROJECT_ROOT%\"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows\install-enterprise-playbook.ps1"
if errorlevel 1 pause
endlocal
