[CmdletBinding()]
param(
    [string]$Model = "qwen3.5:9b",
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }

function Set-DotEnvValue {
    param([string]$Path, [string]$Key, [string]$Value)

    $lines = @()
    if (Test-Path -LiteralPath $Path) {
        $lines = @(Get-Content -LiteralPath $Path)
    }

    # Remove every old occurrence first. This prevents duplicate variables.
    $pattern = "^\s*" + [regex]::Escape($Key) + "\s*="
    $clean = @($lines | Where-Object { $_ -notmatch $pattern })
    $clean += "$Key=$Value"

    [System.IO.File]::WriteAllLines(
        $Path,
        $clean,
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Find-OllamaExe {
    $command = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        "E:\Ollama\ollama.exe",
        "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
        "$env:LOCALAPPDATA\Ollama\ollama.exe",
        "$env:ProgramFiles\Ollama\ollama.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    foreach ($root in @("E:\Ollama", "$env:LOCALAPPDATA\Programs\Ollama")) {
        if (Test-Path -LiteralPath $root) {
            $found = Get-ChildItem -LiteralPath $root -Filter "ollama.exe" -Recurse -ErrorAction SilentlyContinue |
                Select-Object -First 1 -ExpandProperty FullName
            if ($found) { return $found }
        }
    }
    return $null
}

function Test-OllamaApi {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 4 }
    catch { return $null }
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$backendEnv = Join-Path $projectRoot "backend\.env"
$backendEnvExample = Join-Path $projectRoot "backend\.env.example"

Write-Step "Checking Ollama"
$ollamaExe = Find-OllamaExe
if (-not $ollamaExe) {
    Write-Host "Ollama executable was not found." -ForegroundColor Red
    Write-Host "Install Ollama or place ollama.exe in E:\Ollama." -ForegroundColor Yellow
    exit 2
}
Write-Ok "Ollama executable: $ollamaExe"

$tags = Test-OllamaApi
if (-not $tags) {
    Write-Step "Starting Ollama API"
    Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(40)
    do {
        Start-Sleep -Milliseconds 800
        $tags = Test-OllamaApi
    } while (-not $tags -and (Get-Date) -lt $deadline)
    if (-not $tags) { throw "Cannot connect to Ollama at http://127.0.0.1:11434" }
}
Write-Ok "Ollama API is running"

$installed = @($tags.models | ForEach-Object { if ($_.name) { [string]$_.name } elseif ($_.model) { [string]$_.model } })
if ($installed -notcontains $Model) {
    Write-Step "Pulling model $Model"
    Write-Warn "The model may require several GB of storage."
    & $ollamaExe pull $Model
    if ($LASTEXITCODE -ne 0) { throw "ollama pull failed with exit code $LASTEXITCODE" }
} else { Write-Ok "Model already installed: $Model" }

Write-Step "Enabling strict AI agent policy in backend/.env"
if (-not (Test-Path -LiteralPath $backendEnv)) {
    if (-not (Test-Path -LiteralPath $backendEnvExample)) { throw "backend/.env.example was not found" }
    Copy-Item -LiteralPath $backendEnvExample -Destination $backendEnv
    Write-Warn "Created backend/.env from .env.example. Review existing secrets and Zalo settings."
}

$values = [ordered]@{
    AGENT_MODE = "ollama"
    AGENT_STRICT_ESCALATION = "true"
    AGENT_REQUIRE_PLAYBOOK = "true"
    AGENT_MIN_CONFIDENCE = "0.82"
    AUTO_RESOLVE_THRESHOLD = "0.78"
    PLAYBOOK_AUTO_MIN_SCORE = "0.72"
    OLLAMA_BASE_URL = "http://127.0.0.1:11434"
    OLLAMA_MODEL = $Model
    OLLAMA_TIMEOUT_MS = ([string]($TimeoutSeconds * 1000))
    OLLAMA_KEEP_ALIVE = "10m"
    OLLAMA_TEMPERATURE = "0.1"
    OLLAMA_NUM_CTX = "8192"
    AGENT_HISTORY_MESSAGES = "12"
    AGENT_STATUS_CACHE_MS = "10000"
}
foreach ($item in $values.GetEnumerator()) { Set-DotEnvValue -Path $backendEnv -Key $item.Key -Value ([string]$item.Value) }
Write-Ok "Updated backend/.env without duplicate keys"

Write-Step "Testing the selected model"
$testBody = @{
    model = $Model
    stream = $false
    think = $false
    keep_alive = 0
    messages = @(@{ role = "user"; content = "Reply with exactly one word: READY" })
} | ConvertTo-Json -Depth 8
$result = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/chat" -ContentType "application/json" -Body $testBody -TimeoutSec $TimeoutSeconds
if (-not $result.message.content) { throw "Ollama returned an empty test response" }
Write-Ok "Model response: $($result.message.content.Trim())"
Write-Host "`nAI Agent strict configuration completed." -ForegroundColor Green
Write-Host "Restart the HelpDesk backend, then verify /health." -ForegroundColor Yellow
