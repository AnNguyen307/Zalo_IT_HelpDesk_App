param(
    [string]$ProjectRoot = "",
    [switch]$Preview,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Resolve-ProjectRoot {
    param([string]$InputPath)

    if ([string]::IsNullOrWhiteSpace($InputPath)) {
        return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
    }

    $clean = $InputPath.Trim()
    $clean = $clean.Trim('"')
    $clean = $clean.TrimEnd('\')

    if ([string]::IsNullOrWhiteSpace($clean)) {
        throw "ProjectRoot became empty after path cleanup."
    }

    return (Resolve-Path -LiteralPath $clean).Path
}

function Ensure-Directory {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) {
        return
    }

    if ($Preview) {
        Write-Host "[PREVIEW] Create directory: $Path"
        return
    }

    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Get-ReleaseFolder {
    param([string]$FileName)

    $upper = $FileName.ToUpperInvariant()

    if ($upper -match '(^|_)V(?<ver>\d+(?:_\d+)*)') {
        return "v" + ($Matches["ver"] -replace "_", ".")
    }

    if ($upper -match "ZERO_COST") {
        return "legacy-zero-cost"
    }

    return "legacy"
}

function Get-UniqueDestination {
    param(
        [string]$Directory,
        [string]$FileName
    )

    $candidate = Join-Path $Directory $FileName

    if (-not (Test-Path -LiteralPath $candidate)) {
        return $candidate
    }

    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
    $extension = [System.IO.Path]::GetExtension($FileName)
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"

    return Join-Path $Directory ($baseName + "-" + $stamp + $extension)
}

function Move-FileSafely {
    param(
        [System.IO.FileInfo]$File,
        [string]$DestinationDirectory,
        [string]$Label
    )

    Ensure-Directory -Path $DestinationDirectory
    $destination = Get-UniqueDestination -Directory $DestinationDirectory -FileName $File.Name

    if ($Preview) {
        Write-Host ("[PREVIEW] {0}: {1} -> {2}" -f $Label, $File.Name, $destination)
        return
    }

    Move-Item -LiteralPath $File.FullName -Destination $destination -Force
    Write-Ok ("{0}: {1} -> {2}" -f $Label, $File.Name, $destination)
}

function Move-RootDocumentation {
    param(
        [string]$Root,
        [string]$DocsRoot
    )

    $rules = @(
        @{ Pattern = "CHANGES_*.md"; Kind = "release" },
        @{ Pattern = "UPGRADE_*.md"; Kind = "release" },
        @{ Pattern = "AUTO_NGROK.md"; Destination = "deployment" },
        @{ Pattern = "DEPLOYMENT_CHECKLIST.md"; Destination = "deployment" },
        @{ Pattern = "FREE_DEPLOYMENT.md"; Destination = "deployment" },
        @{ Pattern = "README_VSCODE_TERMINALS.txt"; Destination = "deployment" },
        @{ Pattern = "README_AI_AUTOSTART_FIX.txt"; Destination = "troubleshooting" },
        @{ Pattern = "README_AI_START_ORDER_FIX.txt"; Destination = "troubleshooting" },
        @{ Pattern = "README_SQL_SCHEMA_FIX.md"; Destination = "troubleshooting" },
        @{ Pattern = "README_AI_AGENT.md"; Destination = "components" },
        @{ Pattern = "README_ENTERPRISE_PLAYBOOK.md"; Destination = "components" },
        @{ Pattern = "README_PLAYBOOK_LIFECYCLE.md"; Destination = "components" }
    )

    foreach ($rule in $rules) {
        $files = Get-ChildItem -LiteralPath $Root -File -Filter $rule.Pattern -ErrorAction SilentlyContinue

        foreach ($file in $files) {
            if ($rule.Kind -eq "release") {
                $versionFolder = Get-ReleaseFolder -FileName $file.Name
                $destination = Join-Path $DocsRoot ("releases\" + $versionFolder)
            }
            else {
                $destination = Join-Path $DocsRoot $rule.Destination
            }

            Move-FileSafely -File $file -DestinationDirectory $destination -Label "DOC"
        }
    }
}

function Convert-BatContentForNewLocation {
    param([string]$OriginalContent)

    # Convert every old project-root reference before adding the new header.
    $content = $OriginalContent.Replace("%~dp0.", "%PROJECT_ROOT%")
    $content = $content.Replace("%~dp0", "%PROJECT_ROOT%\")

    $header = @(
        "@echo off",
        "setlocal",
        'set "PROJECT_ROOT=%~dp0..\..\.."',
        'for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"'
    )

    # Remove duplicate leading @echo off / setlocal lines from the old launcher.
    $lines = $content -split "\r?\n"
    $start = 0

    while ($start -lt $lines.Count) {
        $trimmed = $lines[$start].Trim().ToLowerInvariant()

        if ($trimmed -eq "@echo off" -or $trimmed -eq "echo off" -or $trimmed -eq "setlocal") {
            $start++
            continue
        }

        break
    }

    $body = if ($start -lt $lines.Count) {
        $lines[$start..($lines.Count - 1)]
    }
    else {
        @()
    }

    return (($header + "" + $body) -join "`r`n")
}

function Move-RootBatFiles {
    param(
        [string]$Root,
        [string]$LauncherDirectory
    )

    $batFiles = @(
        Get-ChildItem -LiteralPath $Root -File -Filter "*.bat" -ErrorAction SilentlyContinue |
            Sort-Object Name
    )

    if ($batFiles.Count -eq 0) {
        Write-Ok "No .bat files remain in project root."
        return @()
    }

    Write-Step ("BAT launchers found: " + $batFiles.Count)

    foreach ($file in $batFiles) {
        Write-Host ("- " + $file.Name)
    }

    if (-not $Preview -and -not $Force) {
        $answer = Read-Host "Type YES to move all root BAT files"
        if ($answer -ne "YES") {
            Write-Warn "Cancelled. No BAT files were moved."
            exit 0
        }
    }

    Ensure-Directory -Path $LauncherDirectory
    $movedNames = New-Object System.Collections.Generic.List[string]

    foreach ($file in $batFiles) {
        $destination = Join-Path $LauncherDirectory $file.Name
        $original = [System.IO.File]::ReadAllText($file.FullName)
        $converted = Convert-BatContentForNewLocation -OriginalContent $original

        if ($Preview) {
            Write-Host ("[PREVIEW] BAT: {0} -> {1}" -f $file.Name, $destination)
        }
        else {
            [System.IO.File]::WriteAllText(
                $destination,
                $converted,
                [System.Text.Encoding]::Default
            )

            Remove-Item -LiteralPath $file.FullName -Force
            Write-Ok ("BAT: {0} -> {1}" -f $file.Name, $destination)
        }

        [void]$movedNames.Add($file.Name)
    }

    return $movedNames.ToArray()
}

function Get-TextFilesForReferenceUpdate {
    param([string]$Root)

    $extensions = @(".json", ".jsonc", ".md", ".txt", ".ps1", ".cmd", ".yml", ".yaml")
    $roots = @(
        (Join-Path $Root ".vscode"),
        (Join-Path $Root "docs"),
        (Join-Path $Root "scripts")
    )

    $result = New-Object System.Collections.Generic.List[System.IO.FileInfo]

    foreach ($searchRoot in $roots) {
        if (-not (Test-Path -LiteralPath $searchRoot)) {
            continue
        }

        $files = Get-ChildItem -LiteralPath $searchRoot -Recurse -File -ErrorAction SilentlyContinue

        foreach ($file in $files) {
            if ($extensions -notcontains $file.Extension.ToLowerInvariant()) {
                continue
            }

            if ($file.FullName -like "*\node_modules\*" -or
                $file.FullName -like "*\dist\*" -or
                $file.FullName -like "*\.git\*") {
                continue
            }

            [void]$result.Add($file)
        }
    }

    foreach ($file in (Get-ChildItem -LiteralPath $Root -File -ErrorAction SilentlyContinue)) {
        if ($extensions -contains $file.Extension.ToLowerInvariant()) {
            [void]$result.Add($file)
        }
    }

    return $result |
        Group-Object FullName |
        ForEach-Object { $_.Group[0] }
}

function Update-References {
    param(
        [string]$Root,
        [string[]]$BatNames
    )

    if (-not $BatNames -or $BatNames.Count -eq 0) {
        return
    }

    Write-Step "Updating references to moved launchers"
    $files = Get-TextFilesForReferenceUpdate -Root $Root

    foreach ($file in $files) {
        $original = [System.IO.File]::ReadAllText($file.FullName)
        $updated = $original

        foreach ($batName in $BatNames) {
            $windowsRelative = "scripts\windows\launchers\" + $batName
            $slashRelative = "scripts/windows/launchers/" + $batName

            $updated = $updated.Replace(".\" + $batName, ".\" + $windowsRelative)
            $updated = $updated.Replace("./" + $batName, "./" + $slashRelative)
            $updated = $updated.Replace('${workspaceFolder}\' + $batName, '${workspaceFolder}\' + $windowsRelative)
            $updated = $updated.Replace('${workspaceFolder}/' + $batName, '${workspaceFolder}/' + $slashRelative)
            $updated = $updated.Replace('%PROJECT_ROOT%\' + $batName, '%PROJECT_ROOT%\' + $windowsRelative)
        }

        if ($updated -eq $original) {
            continue
        }

        if ($Preview) {
            Write-Host ("[PREVIEW] Update references: " + $file.FullName)
        }
        else {
            [System.IO.File]::WriteAllText(
                $file.FullName,
                $updated,
                [System.Text.UTF8Encoding]::new($false)
            )
            Write-Ok ("Updated references: " + $file.FullName)
        }
    }
}

function Write-LauncherReadme {
    param([string]$LauncherDirectory)

    if ($Preview) {
        return
    }

    Ensure-Directory -Path $LauncherDirectory
    $readmePath = Join-Path $LauncherDirectory "README.md"
    $launchers = Get-ChildItem -LiteralPath $LauncherDirectory -File -Filter "*.bat" |
        Sort-Object Name

    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("# Windows launchers")
    [void]$lines.Add("")
    [void]$lines.Add("All BAT launchers are stored outside the project root.")
    [void]$lines.Add("")
    [void]$lines.Add("Run from the project root:")
    [void]$lines.Add("")
    [void]$lines.Add("```powershell")
    [void]$lines.Add(".\scripts\windows\launchers\START_HELPDESK_VSCODE.bat")
    [void]$lines.Add("```")
    [void]$lines.Add("")
    [void]$lines.Add("## Available launchers")
    [void]$lines.Add("")

    foreach ($launcher in $launchers) {
        [void]$lines.Add(("- `{0}`" -f $launcher.Name))
    }

    [System.IO.File]::WriteAllLines(
        $readmePath,
        $lines,
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Ok ("Updated launcher README: " + $readmePath)
}

function Write-DocsIndex {
    param([string]$DocsRoot)

    if ($Preview) {
        return
    }

    Ensure-Directory -Path $DocsRoot
    $indexPath = Join-Path $DocsRoot "INDEX.md"
    $files = Get-ChildItem -LiteralPath $DocsRoot -Recurse -File |
        Where-Object { $_.FullName -ne $indexPath } |
        Sort-Object FullName

    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("# Tài liệu dự án")
    [void]$lines.Add("")
    [void]$lines.Add("Danh mục được tạo tự động.")
    [void]$lines.Add("")

    foreach ($file in $files) {
        $relative = $file.FullName.Substring($DocsRoot.Length).TrimStart("\", "/")
        $link = $relative.Replace("\", "/")
        [void]$lines.Add(("- [{0}](./{0})" -f $link))
    }

    [System.IO.File]::WriteAllLines(
        $indexPath,
        $lines,
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Ok ("Updated docs index: " + $indexPath)
}

$root = Resolve-ProjectRoot -InputPath $ProjectRoot
$docsRoot = Join-Path $root "docs"
$launcherDirectory = Join-Path $root "scripts\windows\launchers"

Write-Step "Project root"
Write-Host $root

if (-not (Test-Path -LiteralPath (Join-Path $root "backend")) -or
    -not (Test-Path -LiteralPath (Join-Path $root "miniapp"))) {
    throw "Expected backend and miniapp directories under: $root"
}

Move-RootDocumentation -Root $root -DocsRoot $docsRoot
$movedBatNames = Move-RootBatFiles -Root $root -LauncherDirectory $launcherDirectory
Update-References -Root $root -BatNames $movedBatNames
Write-LauncherReadme -LauncherDirectory $launcherDirectory
Write-DocsIndex -DocsRoot $docsRoot

Write-Step "Final layout"
Write-Host "Root: README.md, .gitignore, backend, miniapp, scripts, docs, .vscode"
Write-Host "BAT launchers: scripts\windows\launchers"
Write-Host "Release documents: docs\releases"

if ($Preview) {
    Write-Warn "Preview only. Run again with -Force to apply."
}
else {
    Write-Ok "Project cleanup completed."
}
