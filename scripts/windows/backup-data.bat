@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i

set PROVIDER=json
if exist backend\.env (
  for /f "tokens=1,* delims==" %%A in ('findstr /R /I /C:"^[ ]*DB_PROVIDER[ ]*=" backend\.env') do set PROVIDER=%%B
)
set PROVIDER=%PROVIDER: =%

if /I "%PROVIDER%"=="sqlserver" (
  echo [INFO] Exporting SQL Server database...
  pushd backend
  call npm.cmd run db:export-json -- ".\data\sqlserver-backup-%TS%.json"
  if errorlevel 1 (
    popd
    echo [ERROR] SQL Server export failed
    pause
    exit /b 1
  )
  popd
  set DBFILE=backend\data\sqlserver-backup-%TS%.json
) else (
  if not exist backend\data\db.json (
    echo [ERROR] Cannot find backend\data\db.json
    pause
    exit /b 1
  )
  set DBFILE=backend\data\db.json
)

powershell -NoProfile -Command "$items=@('%DBFILE%'); if(Test-Path 'backend/data/uploads'){$items+='backend/data/uploads'}; Compress-Archive -Path $items -DestinationPath 'backups/helpdesk_%TS%.zip' -Force"
if errorlevel 1 (
  echo [ERROR] Backup failed
  pause
  exit /b 1
)

if /I "%PROVIDER%"=="sqlserver" del /Q "%DBFILE%" >nul 2>&1

echo [OK] Database and attachments backed up: backups\helpdesk_%TS%.zip
endlocal
