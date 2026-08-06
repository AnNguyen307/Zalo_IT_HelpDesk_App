[CmdletBinding()]
param(
    [string]$NgrokPath = "",
    [int]$Port = 8080,
    [int]$WaitSeconds = 45,
    [switch]$SkipBackend,
    [switch]$SkipDeploy,
    [switch]$ForceDeploy
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Resolve-NgrokExecutable {
    param([string]$ExplicitPath)

    if ($ExplicitPath) {
        if (Test-Path -LiteralPath $ExplicitPath) {
            return (Resolve-Path -LiteralPath $ExplicitPath).Path
        }
        throw "Khong tim thay ngrok tai duong dan: $ExplicitPath"
    }

    $command = Get-Command ngrok.exe -ErrorAction SilentlyContinue
    if (-not $command) {
        $command = Get-Command ngrok -ErrorAction SilentlyContinue
    }
    if ($command) {
        return $command.Source
    }

    $knownCandidates = @(
        (Join-Path $env:USERPROFILE "Downloads\ngrok-v3-stable-windows-amd64\ngrok.exe"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\ngrok.exe"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\ngrok.exe")
    )

    foreach ($candidate in $knownCandidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $downloadRoot = Join-Path $env:USERPROFILE "Downloads"
    if (Test-Path -LiteralPath $downloadRoot) {
        $found = Get-ChildItem -LiteralPath $downloadRoot -Filter "ngrok.exe" -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }

    throw @"
Khong tim thay ngrok.exe.
Chay script voi tham so -NgrokPath, vi du:
  .\start-helpdesk-auto.ps1 -NgrokPath "C:\Users\ADMIN\Downloads\ngrok-v3-stable-windows-amd64\ngrok.exe"
"@
}

function Test-BackendHealth {
    param([int]$BackendPort)

    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/health" -TimeoutSec 3
        return ($null -ne $response)
    }
    catch {
        return $false
    }
}

function Wait-Until {
    param(
        [scriptblock]$Condition,
        [int]$TimeoutSeconds,
        [string]$Description
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (& $Condition) {
            return $true
        }
        Start-Sleep -Milliseconds 700
    } while ((Get-Date) -lt $deadline)

    throw "Het thoi gian cho: $Description"
}

function Get-NgrokPublicUrl {
    param([int]$BackendPort)

    # ngrok v3: uu tien API endpoints moi.
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/endpoints" -TimeoutSec 3
        $httpsEndpoints = @($response.endpoints | Where-Object {
            $_.url -is [string] -and $_.url.StartsWith("https://")
        })

        $matching = $httpsEndpoints | Where-Object {
            $upstreamUrl = [string]$_.upstream.url
            $upstreamUrl -match "(^|:)$BackendPort/?$"
        } | Select-Object -First 1

        if ($matching) {
            return ([string]$matching.url).TrimEnd("/")
        }
        if ($httpsEndpoints.Count -gt 0) {
            return ([string]$httpsEndpoints[0].url).TrimEnd("/")
        }
    }
    catch {
        # Fallback xuong API tunnels cu, van duoc ngrok v3 ho tro.
    }

    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
        $httpsTunnels = @($response.tunnels | Where-Object {
            $_.public_url -is [string] -and $_.public_url.StartsWith("https://")
        })

        $matching = $httpsTunnels | Where-Object {
            $address = [string]$_.config.addr
            $address -match "(^|:)$BackendPort/?$"
        } | Select-Object -First 1

        if ($matching) {
            return ([string]$matching.public_url).TrimEnd("/")
        }
        if ($httpsTunnels.Count -gt 0) {
            return ([string]$httpsTunnels[0].public_url).TrimEnd("/")
        }
    }
    catch {
        return $null
    }

    return $null
}

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $pattern = "(?m)^" + [regex]::Escape($Key) + "=(.*)$"
    $content = Get-Content -LiteralPath $Path -Raw
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) {
        return $null
    }

    return $match.Groups[1].Value.Trim().Trim('"').Trim("'").TrimEnd("/")
}

function Set-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )

    $content = ""
    if (Test-Path -LiteralPath $Path) {
        $content = Get-Content -LiteralPath $Path -Raw
    }

    $line = "$Key=$Value"
    $pattern = "(?m)^" + [regex]::Escape($Key) + "=.*$"

    if ([regex]::IsMatch($content, $pattern)) {
        $content = [regex]::Replace($content, $pattern, $line)
    }
    else {
        if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
            $content += "`r`n"
        }
        $content += "$line`r`n"
    }

    [System.IO.File]::WriteAllText(
        $Path,
        $content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$backendDirectory = Join-Path $projectRoot "backend"
$miniappDirectory = Join-Path $projectRoot "miniapp"
$miniappEnvPath = Join-Path $miniappDirectory ".env"

if (-not (Test-Path -LiteralPath $miniappEnvPath)) {
    throw "Khong tim thay miniapp\.env. Hay tao file nay tu miniapp\.env.example va dien APP_ID/ZMP_TOKEN truoc."
}

if (-not (Test-Path -LiteralPath $backendDirectory)) {
    throw "Khong tim thay thu muc backend: $backendDirectory"
}
if (-not (Test-Path -LiteralPath $miniappDirectory)) {
    throw "Khong tim thay thu muc miniapp: $miniappDirectory"
}

$ngrokExecutable = Resolve-NgrokExecutable -ExplicitPath $NgrokPath
Write-Ok "Ngrok: $ngrokExecutable"

if (-not $SkipBackend) {
    Write-Step "Kiem tra backend tai localhost:$Port"
    if (-not (Test-BackendHealth -BackendPort $Port)) {
        $backendEscaped = $backendDirectory.Replace("'", "''")
        $backendCommand = "Set-Location -LiteralPath '$backendEscaped'; npm start"
        Start-Process -FilePath "powershell.exe" -ArgumentList @(
            "-NoExit",
            "-ExecutionPolicy", "Bypass",
            "-Command", $backendCommand
        ) | Out-Null

        Wait-Until -TimeoutSeconds $WaitSeconds -Description "backend khoi dong" -Condition {
            Test-BackendHealth -BackendPort $Port
        }
        Write-Ok "Backend dang hoat dong"
    }
    else {
        Write-Ok "Backend da chay san"
    }
}
elseif (-not (Test-BackendHealth -BackendPort $Port)) {
    Write-Warn "Da bo qua khoi dong backend, nhung /health chua truy cap duoc."
}

Write-Step "Kiem tra ngrok"
$publicUrl = Get-NgrokPublicUrl -BackendPort $Port
if (-not $publicUrl) {
    $ngrokEscaped = $ngrokExecutable.Replace("'", "''")
    $ngrokCommand = "& '$ngrokEscaped' http $Port"
    Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $ngrokCommand
    ) | Out-Null

    Wait-Until -TimeoutSeconds $WaitSeconds -Description "ngrok cap URL HTTPS" -Condition {
        $script:publicUrl = Get-NgrokPublicUrl -BackendPort $Port
        return -not [string]::IsNullOrWhiteSpace($script:publicUrl)
    }
}

if (-not $publicUrl) {
    throw "Khong lay duoc URL HTTPS tu ngrok Agent API."
}
Write-Ok "Ngrok URL: $publicUrl"

Write-Step "Kiem tra URL cong khai"
try {
    $remoteHealth = Invoke-RestMethod -Uri "$publicUrl/health" -Headers @{
        "ngrok-skip-browser-warning" = "1"
    } -TimeoutSec 10
    Write-Ok "Endpoint /health truy cap duoc qua ngrok"
}
catch {
    throw "URL ngrok da tao nhung /health khong truy cap duoc: $($_.Exception.Message)"
}

$oldUrl = Get-DotEnvValue -Path $miniappEnvPath -Key "VITE_API_BASE_URL"
$urlChanged = ($oldUrl -ne $publicUrl)

if ($urlChanged) {
    Write-Step "Cap nhat miniapp/.env"
    Write-Host "Cu : $oldUrl"
    Write-Host "Moi: $publicUrl"
    Set-DotEnvValue -Path $miniappEnvPath -Key "VITE_API_BASE_URL" -Value $publicUrl
    Write-Ok "Da cap nhat VITE_API_BASE_URL"
}
else {
    Write-Ok "VITE_API_BASE_URL khong thay doi"
}

$shouldBuildAndDeploy = $urlChanged -or $ForceDeploy
if ($shouldBuildAndDeploy) {
    Write-Step "Build Mini App va dong bo app-config.json"
    Push-Location $miniappDirectory
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $miniappDirectory "node_modules"))) {
            Write-Warn "Chua co node_modules, dang chay npm install"
            & npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install that bai voi exit code $LASTEXITCODE"
            }
        }

        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build that bai voi exit code $LASTEXITCODE"
        }

        if (-not $SkipDeploy) {
            Write-Step "Deploy len Zalo Mini App"
            Write-Host "ZMP se hoi moi truong. Chon Development trong giai doan test." -ForegroundColor Yellow
            & zmp deploy
            if ($LASTEXITCODE -ne 0) {
                throw "zmp deploy that bai voi exit code $LASTEXITCODE"
            }
        }
        else {
            Write-Warn "Da build xong nhung bo qua zmp deploy theo tham so -SkipDeploy."
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Ok "URL khong doi, khong can build/deploy lai."
}

Write-Host "`n==============================================" -ForegroundColor DarkCyan
Write-Host " IT HelpDesk dang san sang" -ForegroundColor Green
Write-Host " API    : $publicUrl" -ForegroundColor White
Write-Host " Health : $publicUrl/health" -ForegroundColor White
Write-Host " Admin  : $publicUrl/admin" -ForegroundColor White
Write-Host "==============================================`n" -ForegroundColor DarkCyan
