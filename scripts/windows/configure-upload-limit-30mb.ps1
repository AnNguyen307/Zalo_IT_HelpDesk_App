param(
  [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

$root = (Resolve-Path $ProjectRoot).Path
$envPath = Join-Path $root "backend\.env"

if (-not (Test-Path $envPath)) {
  throw "Khong tim thay backend\.env tai: $envPath"
}

$info = Get-Item $envPath
if ($info.Length -gt 5MB) {
  throw "backend\.env lon bat thuong ($($info.Length) bytes). Hay sua file .env bi loi truoc khi tiep tuc."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$envPath.before-upload-30mb-$timestamp"
Copy-Item -LiteralPath $envPath -Destination $backupPath -Force
Write-Ok "Da sao luu .env: $backupPath"

$desired = [ordered]@{
  "MAX_ATTACHMENT_MB" = "30"
  "MAX_REPLY_UPLOAD_MB" = "120"
  "MAX_LEGACY_JSON_UPLOAD_MB" = "32"
  "MAX_ATTACHMENTS_PER_REPLY" = "4"
  "MAX_ATTACHMENTS_PER_TICKET" = "8"
}

$lines = [System.IO.File]::ReadAllLines($envPath)
$output = New-Object System.Collections.Generic.List[string]
$managed = @{}
$seen = @{}

foreach ($key in $desired.Keys) { $managed[$key] = $true }

foreach ($line in $lines) {
  $trimmed = $line.Trim()
  if ($trimmed -match '^([A-Za-z_][A-Za-z0-9_]*)=') {
    $key = $matches[1]
    if ($managed.ContainsKey($key)) { continue }
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
  }
  [void]$output.Add($line)
}

[void]$output.Add("")
[void]$output.Add("# Upload limits - v5.5.2")
foreach ($entry in $desired.GetEnumerator()) {
  [void]$output.Add(("{0}={1}" -f $entry.Key, $entry.Value))
}

[System.IO.File]::WriteAllLines(
  $envPath,
  $output,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Step "Cau hinh upload da cap nhat"
Write-Host "MAX_ATTACHMENT_MB=30"
Write-Host "MAX_REPLY_UPLOAD_MB=120"
Write-Host "MAX_ATTACHMENTS_PER_REPLY=4"
Write-Host "MAX_ATTACHMENTS_PER_TICKET=8"
Write-Ok "Moi file duoc phep toi da 30 MB."
