@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows\configure-upload-limit-30mb.ps1" -ProjectRoot "."
if errorlevel 1 (
  echo.
  echo Upload limit configuration failed.
  pause
  exit /b 1
)
echo.
echo Upload limit configured successfully.
pause
