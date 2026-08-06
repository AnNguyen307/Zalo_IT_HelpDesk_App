@echo off
setlocal
set "PROJECT_ROOT=%~dp0..\..\.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"

call "%PROJECT_ROOT%\scripts\windows\start-helpdesk-auto.bat" %*
