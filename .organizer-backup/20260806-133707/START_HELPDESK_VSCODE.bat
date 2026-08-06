@echo off
setlocal
cd /d "%~dp0"
where code >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Khong tim thay lenh code trong PATH.
  echo Hay mo Visual Studio Code, nhan Ctrl+Shift+P va chay:
  echo Shell Command: Install 'code' command in PATH
  pause
  exit /b 1
)
code --new-window "%~dp0"
endlocal
