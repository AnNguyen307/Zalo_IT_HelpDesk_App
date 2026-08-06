param(
  [switch]$SkipMigration,
  [switch]$SkipSeed,
  [switch]$SkipIndex
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Backend = Join-Path $ProjectRoot "backend"

function Step([string]$Text) { Write-Host ""; Write-Host "==> $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "[OK] $Text" -ForegroundColor Green }
function Warn([string]$Text) { Write-Host "[WARN] $Text" -ForegroundColor Yellow }

if (-not (Test-Path (Join-Path $Backend ".env"))) { throw "Khong tim thay backend/.env" }
$envInfo = Get-Item (Join-Path $Backend ".env")
if ($envInfo.Length -gt 1MB) { throw "backend/.env lon bat thuong. Hay sua file truoc khi tiep tuc." }

Step "Kiem tra cau hinh SQL Server"
$required = @("DB_PROVIDER", "SQLSERVER_HOST", "SQLSERVER_DATABASE", "SQLSERVER_USER", "SQLSERVER_PASSWORD")
$envLines = Get-Content (Join-Path $Backend ".env")
foreach ($key in $required) {
  if (-not ($envLines -match "^$key=")) { throw "Thieu $key trong backend/.env" }
}
if (-not ($envLines -match '^DB_PROVIDER=sqlserver\s*$')) { throw "DB_PROVIDER phai la sqlserver truoc khi cai Playbook Governance." }
Ok "SQL Server configuration found"

Step "Cai dependency backend"
Push-Location $Backend
try {
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install that bai" }

  if (-not $SkipMigration) {
    Step "Ap dung SQL migration Playbook Lifecycle"
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) {
      Warn "Migration khong chay duoc bang application login. Truong hop thuong gap: da thu hoi db_ddladmin."
      Write-Host "Mo SQL Server Management Studio bang tai khoan quan tri va chay:" -ForegroundColor Yellow
      Write-Host "  backend\sql\004_playbook_lifecycle.sql" -ForegroundColor White
      Write-Host "Sau do chay lai lenh nay voi -SkipMigration." -ForegroundColor Yellow
      exit 2
    }
    Ok "SQL migration completed"
  }

  if (-not $SkipSeed) {
    Step "Nhap Enterprise Playbook baseline vao SQL Server"
    & npm.cmd run playbook:seed-governance
    if ($LASTEXITCODE -ne 0) { throw "Playbook baseline seed that bai" }
    Ok "Baseline seeded"
  }

  if (-not $SkipIndex) {
    Step "Tao semantic index tu cac version Published"
    & npm.cmd run playbook:index:force
    if ($LASTEXITCODE -ne 0) {
      Warn "Semantic index chua tao duoc. Kiem tra Ollama va embeddinggemma, sau do re-index trong Dashboard."
    } else { Ok "Semantic index completed" }
  }
} finally { Pop-Location }

Write-Host ""; Write-Host "Playbook Governance v5.4 da san sang." -ForegroundColor Green
Write-Host "Restart backend va mo /admin > Vong doi Playbook." -ForegroundColor Cyan
