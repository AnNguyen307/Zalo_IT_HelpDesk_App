param(
  [string]$EmbedModel = "embeddinggemma",
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendDir = Join-Path $projectRoot "backend"
$envPath = Join-Path $backendDir ".env"

function Find-Ollama {
  $cmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "E:\Ollama\ollama.exe",
    "E:\Ollama\bin\ollama.exe"
  )

  foreach ($item in $candidates) {
    if (Test-Path -LiteralPath $item) { return $item }
  }

  if (Test-Path -LiteralPath "E:\Ollama") {
    $found = Get-ChildItem -LiteralPath "E:\Ollama" -Filter "ollama.exe" -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
    if ($found) { return $found }
  }

  throw "Ollama executable was not found."
}

function Stop-LoadedOllamaModels([string]$OllamaExe) {
  try {
    $running = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/ps" -TimeoutSec 5
    $names = @($running.models | ForEach-Object {
      if ($_.name) { [string]$_.name }
      elseif ($_.model) { [string]$_.model }
    } | Where-Object { $_ })

    foreach ($name in $names) {
      Write-Host "[INFO] Unloading model to free memory: $name" -ForegroundColor Yellow
      & $OllamaExe stop $name | Out-Null
    }
  } catch {
    Write-Host "[WARN] Could not inspect/unload running Ollama models: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

function Set-EnvFileValues([System.Collections.IDictionary]$Values) {
  $directory = Split-Path -Parent $envPath
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $tempPath = Join-Path $directory (".env.tmp." + [Guid]::NewGuid().ToString("N"))
  $patterns = @{}
  foreach ($key in $Values.Keys) {
    $patterns[$key] = "^\s*" + [regex]::Escape([string]$key) + "\s*="
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $writer = New-Object System.IO.StreamWriter($tempPath, $false, $utf8NoBom)

  try {
    if (Test-Path -LiteralPath $envPath) {
      $reader = New-Object System.IO.StreamReader($envPath, $true)
      try {
        while (($line = $reader.ReadLine()) -ne $null) {
          $skip = $false
          foreach ($pattern in $patterns.Values) {
            if ($line -match $pattern) {
              $skip = $true
              break
            }
          }
          if (-not $skip) { $writer.WriteLine($line) }
        }
      } finally {
        $reader.Dispose()
      }
    }

    $writer.WriteLine("")
    $writer.WriteLine("# Enterprise Playbook RAG")
    foreach ($key in $Values.Keys) {
      $writer.WriteLine(([string]$key + "=" + [string]$Values[$key]))
    }
  } finally {
    $writer.Dispose()
  }

  if (Test-Path -LiteralPath $envPath) {
    Copy-Item -LiteralPath $envPath -Destination ($envPath + ".before-playbook") -Force
  }
  Move-Item -LiteralPath $tempPath -Destination $envPath -Force
}

Write-Host "==> Checking Ollama" -ForegroundColor Cyan
$ollama = Find-Ollama
Write-Host "[OK] Ollama: $ollama" -ForegroundColor Green

try {
  $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
} catch {
  throw "Ollama API is not running at http://127.0.0.1:11434. Start Ollama first."
}

$names = @($tags.models | ForEach-Object {
  if ($_.name) { [string]$_.name }
  elseif ($_.model) { [string]$_.model }
})

if (-not ($names | Where-Object {
  $_ -eq $EmbedModel -or $_ -eq ($EmbedModel + ":latest") -or $_.StartsWith($EmbedModel + ":")
})) {
  Write-Host "==> Pulling embedding model: $EmbedModel" -ForegroundColor Cyan
  & $ollama pull $EmbedModel
  if ($LASTEXITCODE -ne 0) { throw "Could not pull $EmbedModel" }
} else {
  Write-Host "[OK] Embedding model already installed: $EmbedModel" -ForegroundColor Green
}

# The chat model can consume several GB of RAM/VRAM. Unload it before indexing.
Stop-LoadedOllamaModels -OllamaExe $ollama

Write-Host "==> Updating backend/.env" -ForegroundColor Cyan
Set-EnvFileValues ([ordered]@{
  PLAYBOOK_ENABLED = "true"
  PLAYBOOK_FILE = "./playbooks/enterprise-playbook.json"
  PLAYBOOK_INDEX_FILE = "./data/playbook-index.json"
  PLAYBOOK_SEMANTIC = "true"
  PLAYBOOK_AUTO_INDEX = "false"
  PLAYBOOK_EMBED_MODEL = $EmbedModel
  PLAYBOOK_EMBED_TIMEOUT_MS = ($TimeoutSeconds * 1000).ToString()
  PLAYBOOK_EMBED_BATCH_SIZE = "4"
  PLAYBOOK_TOP_K = "5"
  PLAYBOOK_MIN_SCORE = "0.20"
  PLAYBOOK_AUTO_MIN_SCORE = "0.72"
  PLAYBOOK_LEXICAL_WEIGHT = "0.35"
  PLAYBOOK_MAX_ENTRY_CHARS = "10000"
})
Write-Host "[OK] backend/.env updated" -ForegroundColor Green

Write-Host "==> Building semantic index" -ForegroundColor Cyan
Push-Location $backendDir
try {
  npm run playbook:index:force
  if ($LASTEXITCODE -ne 0) { throw "Playbook index command failed." }
} finally {
  Pop-Location
  try { & $ollama stop $EmbedModel | Out-Null } catch { }
}

Write-Host "[OK] Enterprise Playbook is ready." -ForegroundColor Green
Write-Host "Restart the HelpDesk backend and check /health -> playbook." -ForegroundColor Yellow
