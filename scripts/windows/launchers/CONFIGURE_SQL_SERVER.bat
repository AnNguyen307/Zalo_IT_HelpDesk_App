@echo off
setlocal
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

cd /d "%PROJECT_ROOT%\"
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
