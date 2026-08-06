@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows\install-enterprise-playbook.ps1"
if errorlevel 1 pause
endlocal
