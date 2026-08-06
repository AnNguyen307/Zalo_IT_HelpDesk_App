[CmdletBinding()]
param(
    [int]$Port = 8080,
    [int]$WaitSeconds = 60,
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

function Test-BackendHealth {
    param([int]$BackendPort)

    try {
        $response = Invoke-RestMethod `
            -Uri "http://127.0.0.1:$BackendPort/health" `
            -TimeoutSec 3
        return ($null -ne $response)
    }
    catch {
        return $false
    }
}

function Get-NgrokPublicUrl {
    param([int]$BackendPort)

    try {
        $response = Invoke-RestMethod `
            -Uri "http://127.0.0.1:4040/api/endpoints" `
            -TimeoutSec 3

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
        # Thu API cu neu endpoint API moi chua san sang.
    }

    try {
        $response = Invoke-RestMethod `
            -Uri "http://127.0.0.1:4040/api/tunnels" `
            -TimeoutSec 3

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

function Wait-ForValue {
    param(
        [scriptblock]$Action,
        [int]$TimeoutSeconds,
        [string]$Description
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        $value = & $Action
        if ($null -ne $value -and "$value".Length -gt 0) {
            return $value
        }
        Start-Sleep -Milliseconds 700
    } while ((Get-Date) -lt $deadline)

    throw "Het thoi gian cho: $Description"
}

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $content = Get-Content -LiteralPath $Path -Raw
    $pattern = "(?m)^" + [regex]::Escape($Key) + "=(.*)$"
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
$miniappDirectory = Join-Path $projectRoot "miniapp"
$miniappEnvPath = Join-Path $miniappDirectory ".env"

if (-not (Test-Path -LiteralPath $miniappEnvPath)) {
    throw "Khong tim thay miniapp\.env"
}

Write-Step "Cho backend khoi dong"
$null = Wait-ForValue -TimeoutSeconds $WaitSeconds -Description "backend /health" -Action {
    if (Test-BackendHealth -BackendPort $Port) { return "ready" }
    return $null
}
Write-Ok "Backend dang hoat dong tai localhost:$Port"

Write-Step "Cho ngrok cap URL HTTPS"
$publicUrl = Wait-ForValue -TimeoutSeconds $WaitSeconds -Description "ngrok Agent API" -Action {
    return Get-NgrokPublicUrl -BackendPort $Port
}
Write-Ok "Ngrok URL: $publicUrl"

Write-Step "Kiem tra endpoint cong khai"
$null = Invoke-RestMethod `
    -Uri "$publicUrl/health" `
    -Headers @{ "ngrok-skip-browser-warning" = "1" } `
    -TimeoutSec 10
Write-Ok "Endpoint /health truy cap duoc"

$oldUrl = Get-DotEnvValue `
    -Path $miniappEnvPath `
    -Key "VITE_API_BASE_URL"
$urlChanged = ($oldUrl -ne $publicUrl)

if ($urlChanged) {
    Write-Step "Cap nhat miniapp/.env"
    Write-Host "Cu : $oldUrl"
    Write-Host "Moi: $publicUrl"
    Set-DotEnvValue `
        -Path $miniappEnvPath `
        -Key "VITE_API_BASE_URL" `
        -Value $publicUrl
    Write-Ok "Da cap nhat VITE_API_BASE_URL"
}
else {
    Write-Ok "VITE_API_BASE_URL khong thay doi"
}

if ($urlChanged -or $ForceDeploy) {
    Write-Step "Build Mini App"
    Push-Location $miniappDirectory
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $miniappDirectory "node_modules"))) {
            Write-Warn "Chua co node_modules, dang chay npm install"
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install that bai voi exit code $LASTEXITCODE"
            }
        }

        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build that bai voi exit code $LASTEXITCODE"
        }

        if (-not $SkipDeploy) {
            Write-Step "Deploy len Zalo Mini App"
            Write-Host "Chon Development trong giai doan test." -ForegroundColor Yellow
            & zmp.cmd deploy
            if ($LASTEXITCODE -ne 0) {
                Write-Host ""
                Write-Warning "ZMP deploy thất bại. Có thể phiên đăng nhập đã hết hạn."
                Write-Host "Đang mở quy trình đăng nhập lại..." -ForegroundColor Cyan

                & zmp login

                if ($LASTEXITCODE -ne 0) {
                    throw "ZMP login thất bại với exit code $LASTEXITCODE"
                }

                Write-Host ""
                Write-Host "==> Đăng nhập thành công, deploy lại Mini App" `
                    -ForegroundColor Cyan

                & zmp deploy

                if ($LASTEXITCODE -ne 0) {
                    throw "ZMP deploy vẫn thất bại sau khi đăng nhập lại. Exit code: $LASTEXITCODE"
                }

                Write-Host "[OK] Deploy thành công sau khi đăng nhập lại" `
                    -ForegroundColor Green
            }
        }
        else {
            Write-Warn "Da bo qua deploy theo tham so -SkipDeploy"
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Ok "URL khong doi, khong can build/deploy lai"
}

Write-Host "`n==============================================" -ForegroundColor DarkCyan
Write-Host " IT HelpDesk dang san sang" -ForegroundColor Green
Write-Host " API    : $publicUrl" -ForegroundColor White
Write-Host " Health : $publicUrl/health" -ForegroundColor White
Write-Host " Admin  : $publicUrl/admin" -ForegroundColor White
Write-Host "==============================================`n" -ForegroundColor DarkCyan
