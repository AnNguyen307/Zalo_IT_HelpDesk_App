@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows\configure-sqlserver.ps1"
if errorlevel 1 (
  echo.
  echo SQL Server configuration failed.
  pause
  exit /b 1
)
echo.
echo SQL Server configuration completed.
pause
