@echo off
setlocal
cd /d "%~dp0\..\..\backend"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 20+ chua duoc cai hoac chua co trong PATH.
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo [INFO] Da tao backend\.env. Hay doi APP_SECRET va ADMIN_PASSWORD.
)

node src\server.mjs
endlocal
