param(
    [string]$ScriptPath = ".\scripts\windows\organize-project-files.ps1"
)

$ErrorActionPreference = "Stop"
$resolved = (Resolve-Path -LiteralPath $ScriptPath).Path
$tokens = $null
$errors = $null

[System.Management.Automation.Language.Parser]::ParseFile(
    $resolved,
    [ref]$tokens,
    [ref]$errors
) | Out-Null

if ($errors.Count -gt 0) {
    Write-Host "PowerShell syntax errors:" -ForegroundColor Red

    foreach ($errorItem in $errors) {
        Write-Host (
            "{0}:{1}:{2} {3}" -f
            $resolved,
            $errorItem.Extent.StartLineNumber,
            $errorItem.Extent.StartColumnNumber,
            $errorItem.Message
        ) -ForegroundColor Red
    }

    exit 1
}

Write-Host "[OK] PowerShell syntax is valid: $resolved" -ForegroundColor Green
