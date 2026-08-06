@echo off
setlocal
where ollama >nul 2>&1
if errorlevel 1 (
  echo [INFO] Ollama chua duoc cai. App van chay day du voi AGENT_MODE=rules.
  pause
  exit /b 0
)

echo [INFO] Cac model Ollama dang co:
ollama list
echo.
echo De dung local LLM, dat AGENT_MODE=ollama trong backend\.env.
pause
endlocal
