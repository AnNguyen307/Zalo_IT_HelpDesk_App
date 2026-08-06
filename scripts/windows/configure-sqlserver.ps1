param(
  [string]$Server = "localhost",
  [int]$Port = 1433,
  [string]$Instance = "",
  [string]$Database = "ZaloHelpDesk",
  [ValidateSet("sql", "ntlm")]
  [string]$Auth = "sql",
  [string]$User = "",
  [string]$Domain = "",
  [switch]$SkipImport,
  [switch]$ForceImport
)

$ErrorActionPreference = "Stop"

function Step([string]$message) { Write-Host "`n==> $message" -ForegroundColor Cyan }
function Ok([string]$message) { Write-Host "[OK] $message" -ForegroundColor Green }
function Warn([string]$message) { Write-Host "[WARN] $message" -ForegroundColor Yellow }

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendRoot = Join-Path $projectRoot "backend"
$envPath = Join-Path $backendRoot ".env"
$dataPath = Join-Path $backendRoot "data\db.json"

if (-not (Test-Path $backendRoot)) { throw "Backend directory not found: $backendRoot" }

if (Test-Path $envPath) {
  $envInfo = Get-Item $envPath
  if ($envInfo.Length -gt 1MB) {
    throw "backend/.env is larger than 1 MiB. Repair the corrupted .env before configuring SQL Server."
  }
  $backup = "$envPath.before-sqlserver-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $envPath -Destination $backup -Force
  Ok "Backed up backend/.env to $backup"
}
else {
  $example = Join-Path $backendRoot ".env.example"
  if (-not (Test-Path $example)) { throw "Neither backend/.env nor backend/.env.example exists." }
  Copy-Item -LiteralPath $example -Destination $envPath -Force
  Ok "Created backend/.env from .env.example"
}

if (-not $User) {
  $userPrompt = "SQL Server login"
  if ($Auth -eq "ntlm") { $userPrompt = "Windows/NTLM user name" }
  $User = Read-Host $userPrompt
}
if (-not $User) { throw "A database user is required." }

$securePassword = Read-Host "Database password" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if ([string]::IsNullOrWhiteSpace($Password)) { throw "Database password cannot be empty." }
if ($Password.Contains('"') -or $Password.Contains("`r") -or $Password.Contains("`n")) {
  throw 'For this installer, the database password cannot contain a double quote or a newline.'
}
if ($Auth -eq "ntlm" -and -not $Domain) {
  $Domain = Read-Host "Windows domain or computer name"
  if (-not $Domain) { throw "SQLSERVER_DOMAIN is required for NTLM authentication." }
}

Step "Updating backend/.env without duplicate keys"
$managed = [ordered]@{
  DB_PROVIDER = "sqlserver"
  SQLSERVER_HOST = $Server
  SQLSERVER_PORT = [string]$Port
  SQLSERVER_INSTANCE = $Instance
  SQLSERVER_DATABASE = $Database
  SQLSERVER_AUTH = $Auth
  SQLSERVER_USER = $User
  SQLSERVER_PASSWORD = $Password
  SQLSERVER_DOMAIN = $Domain
  SQLSERVER_ENCRYPT = "false"
  SQLSERVER_TRUST_SERVER_CERTIFICATE = "true"
  SQLSERVER_CONNECTION_TIMEOUT_MS = "15000"
  SQLSERVER_REQUEST_TIMEOUT_MS = "30000"
  SQLSERVER_POOL_MAX = "10"
  SQLSERVER_POOL_MIN = "0"
  SQLSERVER_POOL_IDLE_TIMEOUT_MS = "30000"
}

$lines = [System.IO.File]::ReadAllLines($envPath)
$output = New-Object System.Collections.Generic.List[string]
$seen = @{}

foreach ($line in $lines) {
  $trimmed = $line.Trim()
  if ($trimmed -match '^([A-Za-z_][A-Za-z0-9_]*)=') {
    $key = $matches[1]
    if ($managed.Contains($key)) { continue }
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
  }
  [void]$output.Add($line)
}

[void]$output.Add("")
[void]$output.Add("# SQL Server database - configured $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
foreach ($entry in $managed.GetEnumerator()) {
  [void]$output.Add(("{0}={1}" -f $entry.Key, $entry.Value))
}

[System.IO.File]::WriteAllLines($envPath, $output, [System.Text.UTF8Encoding]::new($false))
Ok "backend/.env updated"

if (Test-Path $dataPath) {
  $dataBackup = Join-Path (Split-Path $dataPath) ("db-before-sqlserver-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Copy-Item -LiteralPath $dataPath -Destination $dataBackup -Force
  Ok "Backed up JSON database to $dataBackup"
}

Step "Installing backend dependencies"
Push-Location $backendRoot
try {
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }

  Step "Applying SQL Server schema"
  & npm.cmd run db:migrate
  if ($LASTEXITCODE -ne 0) { throw "SQL Server migration failed with exit code $LASTEXITCODE" }

  Step "Checking SQL Server connection"
  & npm.cmd run db:status
  if ($LASTEXITCODE -ne 0) { throw "SQL Server status check failed with exit code $LASTEXITCODE" }

  if (-not $SkipImport -and (Test-Path $dataPath)) {
    $importArgs = @("run", "db:import-json", "--")
    if ($ForceImport) { $importArgs += "--force" }
    Step "Importing existing db.json into SQL Server"
    & npm.cmd @importArgs
    if ($LASTEXITCODE -ne 0) { throw "JSON import failed with exit code $LASTEXITCODE" }
  }
  elseif ($SkipImport) {
    Warn "Skipped JSON import by request. The backend will seed the default Knowledge Base on first start."
  }
}
finally {
  Pop-Location
}

Write-Host "`nSQL Server configuration completed." -ForegroundColor Green
Write-Host "Restart the backend and verify the database section at http://127.0.0.1:8080/health" -ForegroundColor Yellow
