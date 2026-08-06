@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   Zalo HelpDesk - Organize project documentation
echo ============================================================
echo.
echo 1. Preview only
echo 2. Apply cleanup
echo 3. Exit
echo.

choice /C 123 /N /M "Choose [1-3]: "

if errorlevel 3 exit /b 0

if errorlevel 2 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass ^
      -File "%~dp0scripts\windows\organize-project-files.ps1" ^
      -ProjectRoot "%~dp0."
    exit /b %ERRORLEVEL%
)

powershell.exe -NoProfile -ExecutionPolicy Bypass ^
  -File "%~dp0scripts\windows\organize-project-files.ps1" ^
  -ProjectRoot "%~dp0." ^
  -Preview

exit /b %ERRORLEVEL%
