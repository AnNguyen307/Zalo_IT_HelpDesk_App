param(
  [string]$Model = "qwen3.5:9b",
  [int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"
$api = "http://127.0.0.1:11434/api/tags"
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$status = $null

Write-Host "[INFO] Waiting for Ollama API at http://127.0.0.1:11434 ..." -ForegroundColor Cyan

while ((Get-Date) -lt $deadline) {
  try {
    $status = Invoke-RestMethod -Uri $api -Method Get -TimeoutSec 3
    break
  }
  catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $status) {
  Write-Host "[ERROR] Ollama API did not become ready within $WaitSeconds seconds." -ForegroundColor Red
  Write-Host "        Open the VS Code terminal named 'HelpDesk: Ollama AI' and inspect its error." -ForegroundColor Yellow
  Write-Host "        Manual test: Invoke-RestMethod http://127.0.0.1:11434/api/tags" -ForegroundColor Yellow
  exit 1
}

$installed = @($status.models | ForEach-Object {
  if ($_.name) { [string]$_.name } elseif ($_.model) { [string]$_.model }
})

Write-Host "[OK] Ollama API is ready." -ForegroundColor Green

if ($installed -contains $Model) {
  Write-Host "[OK] Model installed: $Model" -ForegroundColor Green
}
else {
  Write-Host "[ERROR] Required model is not installed: $Model" -ForegroundColor Red
  Write-Host "        Run: ollama pull $Model" -ForegroundColor Yellow
  exit 1
}

$backendDir = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "backend"
if (-not (Test-Path (Join-Path $backendDir "package.json"))) {
  throw "Backend folder not found: $backendDir"
}

Set-Location $backendDir
Write-Host "[INFO] Starting HelpDesk backend only after Ollama is ready..." -ForegroundColor Cyan
& npm.cmd start
exit $LASTEXITCODE
