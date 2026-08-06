@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-helpdesk-auto.ps1" %*
if errorlevel 1 (
  echo.
  echo [ERROR] Qua trinh khoi dong tu dong that bai.
  pause
  exit /b 1
)
endlocal
