[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendDir = Join-Path $projectRoot "backend"
$envPath = Join-Path $backendDir ".env"

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
    $writer.WriteLine("# Enterprise Playbook RAG - BM25 baseline")
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

if (-not (Test-Path -LiteralPath $backendDir)) {
  throw "Khong tim thay thu muc backend: $backendDir"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20+ chua duoc cai hoac chua co trong PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm chua co trong PATH."
}
if (-not (Test-Path -LiteralPath $envPath)) {
  $examplePath = Join-Path $backendDir ".env.example"
  if (-not (Test-Path -LiteralPath $examplePath)) {
    throw "Khong tim thay backend/.env.example."
  }
  Copy-Item -LiteralPath $examplePath -Destination $envPath
  Write-Host "[INFO] Created backend/.env from .env.example; update APP_SECRET and ADMIN_PASSWORD before use." -ForegroundColor Yellow
}

Write-Host "==> Updating backend/.env for BM25 Playbook retrieval" -ForegroundColor Cyan
Set-EnvFileValues ([ordered]@{
  PLAYBOOK_ENABLED = "true"
  PLAYBOOK_FILE = "./playbooks/enterprise-playbook.json"
  PLAYBOOK_INDEX_FILE = "./data/playbook-index.json"
  PLAYBOOK_RETRIEVAL_MODE = "lexical"
  PLAYBOOK_EMBED_PROVIDER = "none"
  PLAYBOOK_SEMANTIC = "false"
  PLAYBOOK_AUTO_INDEX = "false"
  PLAYBOOK_EMBED_MODEL = "none"
  PLAYBOOK_TOP_K = "5"
  PLAYBOOK_MIN_SCORE = "0.20"
  PLAYBOOK_AUTO_MIN_SCORE = "0.72"
  PLAYBOOK_LEXICAL_WEIGHT = "0.35"
  PLAYBOOK_MAX_ENTRY_CHARS = "10000"
})
Write-Host "[OK] backend/.env updated; backup saved as .env.before-playbook" -ForegroundColor Green

Write-Host "==> Running Playbook retrieval benchmark" -ForegroundColor Cyan
Push-Location $backendDir
try {
  npm run playbook:benchmark
  if ($LASTEXITCODE -ne 0) { throw "Playbook benchmark failed." }
} finally {
  Pop-Location
}

Write-Host "[OK] Enterprise Playbook BM25 baseline is ready." -ForegroundColor Green
Write-Host "Restart the backend and check /health -> playbook." -ForegroundColor Yellow
