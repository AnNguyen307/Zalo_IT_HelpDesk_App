@echo off
setlocal
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

echo.
echo ============================================================
echo   Zalo HelpDesk - Project organizer
echo ============================================================
echo.
echo 1. Preview only
echo 2. Apply cleanup
echo 3. Exit
echo.

choice /C 123 /N /M "Choose [1-3]: "

if errorlevel 3 exit /b 0

if errorlevel 2 (
    python "%PROJECT_ROOT%\scripts\tools\organize_project.py" ^
      --root "%PROJECT_ROOT%" ^
      --apply
    exit /b %ERRORLEVEL%
)

python "%PROJECT_ROOT%\scripts\tools\organize_project.py" ^
  --root "%PROJECT_ROOT%" ^
  --preview

exit /b %ERRORLEVEL%
