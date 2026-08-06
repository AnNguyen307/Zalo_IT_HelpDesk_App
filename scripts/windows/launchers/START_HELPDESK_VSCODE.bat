@echo off
setlocal
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

cd /d "%PROJECT_ROOT%\"
where code >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Khong tim thay lenh code trong PATH.
  echo Hay mo Visual Studio Code, nhan Ctrl+Shift+P va chay:
  echo Shell Command: Install 'code' command in PATH
  pause
  exit /b 1
)
code --new-window "%PROJECT_ROOT%\"
endlocal
