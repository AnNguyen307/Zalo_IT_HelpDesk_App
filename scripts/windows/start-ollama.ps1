param(
  [string]$Model = "qwen3.5:9b",
  [int]$WaitSeconds = 45
)

$ErrorActionPreference = "Stop"

function Test-OllamaApi {
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 3
  }
  catch {
    return $null
  }
}

function Find-OllamaExe {
  $candidates = New-Object System.Collections.Generic.List[string]

  $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    [void]$candidates.Add($command.Source)
  }

  foreach ($path in @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "E:\Ollama\ollama.exe",
    "E:\Ollama\bin\ollama.exe"
  )) {
    if ($path) { [void]$candidates.Add($path) }
  }

  if (Test-Path "E:\Ollama") {
    $found = Get-ChildItem "E:\Ollama" -Filter "ollama.exe" -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
    if ($found) { [void]$candidates.Add($found) }
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  return $null
}

function Show-ModelStatus($response) {
  $installed = @($response.models | ForEach-Object { if ($_.name) { $_.name } else { $_.model } })
  if ($installed -contains $Model) {
    Write-Host "[OK] Model installed: $Model" -ForegroundColor Green
  }
  else {
    Write-Host "[WARN] Model not installed: $Model" -ForegroundColor Yellow
    Write-Host "       Run: ollama pull $Model" -ForegroundColor Yellow
  }
}

# Preserve a user-level custom model directory such as E:\Ollama\models.
$userModels = [Environment]::GetEnvironmentVariable("OLLAMA_MODELS", "User")
if ($userModels) {
  $env:OLLAMA_MODELS = $userModels
  Write-Host "[INFO] OLLAMA_MODELS=$userModels"
}

$status = Test-OllamaApi
if ($status) {
  Write-Host "[OK] Ollama API is already running at http://127.0.0.1:11434" -ForegroundColor Green
  Show-ModelStatus $status
  Write-Host "[INFO] Keep this terminal open. Ctrl+C only stops this watcher, not an external Ollama app."
  while ($true) { Start-Sleep -Seconds 3600 }
}

$ollamaExe = Find-OllamaExe
if (-not $ollamaExe) {
  throw "Ollama executable was not found. Checked PATH, LocalAppData and E:\Ollama."
}

Write-Host "[INFO] Starting Ollama server:" -ForegroundColor Cyan
Write-Host "       $ollamaExe serve"
Write-Host "[INFO] API target: http://127.0.0.1:11434"

# Run in this VS Code integrated terminal so there is no floating PowerShell window.
& $ollamaExe serve
