# backend/scripts/lint-security.ps1
# Regression guard -- fails if forbidden strings reappear in backend source.
# Run:  powershell -ExecutionPolicy Bypass -File backend/scripts/lint-security.ps1
# Or:   npm run lint:security   (from backend/)
#
# Checks:
#   1. process.env.FASTAPI_BASE (without _URL suffix) -- wrong env var name
#   2. Hardcoded Tailscale hostnames (tail*, mothership*) as URL fallbacks
#   3. Leftover raw PORTAL_TOKEN reads that skip PORTAL_PATCH_TOKEN

param(
    [switch]$CI  # In CI mode, exits with code 1 on failure instead of just warning
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $PSScriptRoot   # backend/
$repoRoot  = Split-Path -Parent $scriptDir       # repo root (fallback)

# If invoked from repo root via npm, $scriptDir may resolve oddly — normalise.
if (-not (Test-Path "$scriptDir/server.js")) {
    $scriptDir = Join-Path (Get-Location) "backend"
}
if (-not (Test-Path "$scriptDir/server.js")) {
    Write-Host "ERROR: Cannot locate backend/server.js from $scriptDir" -ForegroundColor Red
    exit 1
}

# ---- Files to scan: .js files under backend/, excluding node_modules & coverage ----
$files = Get-ChildItem -Path $scriptDir -Recurse -Include "*.js" |
    Where-Object {
        $_.FullName -notmatch "node_modules" -and
        $_.FullName -notmatch "coverage" -and
        $_.FullName -notmatch "\.min\.js$"
    }

$violations = @()

foreach ($file in $files) {
    $relPath = $file.FullName.Replace($scriptDir, "backend").Replace("\", "/")
    $lineNum = 0

    foreach ($line in (Get-Content $file.FullName)) {
        $lineNum++

        # Skip comments
        if ($line -match '^\s*(//|/?\*|\*)') { continue }

        # ---- Rule 1: process.env.FASTAPI_BASE without _URL suffix ----
        # Matches process.env.FASTAPI_BASE but NOT process.env.FASTAPI_BASE_URL
        if ($line -match 'process\.env\.FASTAPI_BASE(?!_URL)\b') {
            $violations += [PSCustomObject]@{
                File    = $relPath
                Line    = $lineNum
                Rule    = "FASTAPI_BASE (missing _URL suffix)"
                Content = $line.Trim()
            }
        }

        # ---- Rule 2: Hardcoded Tailscale / mothership hostnames ----
        if ($line -match 'mothership|\.tail[0-9a-z]+\.ts\.net') {
            $violations += [PSCustomObject]@{
                File    = $relPath
                Line    = $lineNum
                Rule    = "Hardcoded Tailscale/mothership URL"
                Content = $line.Trim()
            }
        }

        # ---- Rule 3: Raw PORTAL_TOKEN env read without PORTAL_PATCH_TOKEN ----
        # Catches: process.env.PORTAL_TOKEN  (but NOT process.env.PORTAL_PATCH_TOKEN)
        if ($line -match 'process\.env\.PORTAL_TOKEN\b' -and $line -notmatch 'PORTAL_PATCH_TOKEN') {
            $violations += [PSCustomObject]@{
                File    = $relPath
                Line    = $lineNum
                Rule    = "Legacy PORTAL_TOKEN without PORTAL_PATCH_TOKEN fallback"
                Content = $line.Trim()
            }
        }
    }
}

# ---- Report ----
if ($violations.Count -eq 0) {
    Write-Host ""
    Write-Host "  lint:security -- ALL CLEAN" -ForegroundColor Green
    Write-Host "  Scanned $($files.Count) files, 0 violations." -ForegroundColor DarkGray
    Write-Host ""
    exit 0
} else {
    Write-Host ""
    Write-Host "  lint:security -- $($violations.Count) VIOLATION(S) FOUND" -ForegroundColor Red
    Write-Host ""
    $violations | Format-Table -Property File, Line, Rule, Content -AutoSize -Wrap
    Write-Host "  Fix the above before committing." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
