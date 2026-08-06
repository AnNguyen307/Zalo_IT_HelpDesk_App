@echo off
setlocal
where ngrok >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Chua tim thay ngrok trong PATH.
  echo Co the sua file nay va thay ngrok bang duong dan day du toi ngrok.exe.
  pause
  exit /b 1
)
echo [INFO] Dang mo ngrok toi http://localhost:8080
ngrok http 8080
endlocal
