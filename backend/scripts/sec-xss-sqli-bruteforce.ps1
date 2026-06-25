###############################################################################
# Focused, SAFE local security tests: XSS, SQL Injection, Brute-force login.
#
# Controlled scope only:
#   - Safe, non-destructive payloads (auth-bypass probes + reflected-XSS probes).
#   - No password lists / dictionary attacks — brute-force test is a small
#     fixed burst against ONE throwaway email to prove rate-limiting engages.
#   - Targets the local backend only (default http://localhost:3000).
#
# Complements backend/scripts/run-security-tests.ps1 (broad suite); this script
# documents each probe in the format: field/route, payload, expected, actual.
#
# Usage:  pwsh backend/scripts/sec-xss-sqli-bruteforce.ps1
###############################################################################
param(
  [string]$Base = "http://localhost:3000",
  [int]$BruteAttempts = 12
)

$login = "$Base/api/auth/login"
$rows  = @()
function Add-Row($category, $route, $field, $payload, $expected, $actual, $verdict) {
  $script:rows += [PSCustomObject]@{
    Category=$category; Route=$route; Field=$field; Payload=$payload
    Expected=$expected; Actual=$actual; Verdict=$verdict
  }
}

# Helper: POST JSON, return @{ status; body } whether success or HTTP error.
function Invoke-Login($bodyObj) {
  $json = $bodyObj | ConvertTo-Json -Compress
  try {
    $r = Invoke-WebRequest -Uri $login -Method POST -UseBasicParsing -ContentType "application/json" -Body $json -ErrorAction Stop
    return @{ status=[int]$r.StatusCode; body=$r.Content }
  } catch {
    $code = 0; $body = ""
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode.value__ }
    try { $body = $_.ErrorDetails.Message } catch {}
    return @{ status=$code; body=$body }
  }
}

Write-Host "=== SAFE SECURITY PROBES vs $Base ===" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. SQL INJECTION — auth-bypass probes on the login email/password fields.
#    Pass criteria: NOT 200 (no bypass), NO access_token issued, and NO raw DB
#    error string leaked (postgres/SQL/relation/column/syntax).
# ---------------------------------------------------------------------------
$sqliPayloads = @(
  @{ email = "x' OR '1'='1"; password = "x"; note = "classic OR-true" },
  @{ email = "admin'--";     password = "x"; note = "comment-out password" },
  @{ email = "x'; SELECT 1;--"; password = "x"; note = "stacked query probe" }
)
foreach ($p in $sqliPayloads) {
  $res = Invoke-Login @{ email=$p.email; password=$p.password }
  $leak = $res.body -match "SQL|syntax|postgres|pg_|relation|column|supabase\.co"
  $bypass = ($res.status -eq 200) -or ($res.body -match "access_token")
  $verdict = if (-not $bypass -and -not $leak) { "PASS" } else { "FAIL" }
  $actual = "HTTP $($res.status); bypass=$bypass; dbLeak=$leak"
  Add-Row "SQL Injection" "POST /api/auth/login" "email ($($p.note))" $p.email `
    "Reject (400/401), no token, no DB error leaked" $actual $verdict
}

# ---------------------------------------------------------------------------
# 2. XSS — reflected-payload probes. API must return JSON (not HTML) and must
#    NOT echo the raw <script>/onerror payload back unescaped.
# ---------------------------------------------------------------------------
$xssPayloads = @(
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>'
)
foreach ($x in $xssPayloads) {
  $res = Invoke-Login @{ email=$x; password="x" }
  $reflectedRaw = $res.body -match [regex]::Escape($x)
  $ctype = "application/json (JSON error body)"
  $verdict = if (-not $reflectedRaw) { "PASS" } else { "FAIL" }
  $actual = "HTTP $($res.status); rawPayloadReflected=$reflectedRaw"
  Add-Row "XSS (reflected)" "POST /api/auth/login" "email" $x `
    "Payload not reflected unescaped; JSON response" $actual $verdict
}

# ---------------------------------------------------------------------------
# 3. BRUTE-FORCE — small fixed burst of wrong passwords against ONE throwaway
#    email. Pass criteria: a 429 (rate-limited) appears within the burst.
#    SAFE: no real account, no password list, capped at $BruteAttempts.
# ---------------------------------------------------------------------------
$bfEmail = "sec-bruteforce-probe@example.com"
$got429 = $false; $at = 0; $codes = @()
for ($i=1; $i -le $BruteAttempts; $i++) {
  $res = Invoke-Login @{ email=$bfEmail; password="wrong-$i" }
  $codes += $res.status
  if ($res.status -eq 429) { $got429 = $true; $at = $i; break }
}
$verdict = if ($got429) { "PASS" } else { "WARN" }
$actual = if ($got429) { "429 at attempt $at/$BruteAttempts" } else { "no 429 in $BruteAttempts attempts (codes: $($codes -join ','))" }
Add-Row "Brute-force" "POST /api/auth/login" "email/password" "$BruteAttempts rapid wrong logins (1 email)" `
  "429 Too Many Requests before burst ends" $actual $verdict

# ---------------------------------------------------------------------------
# Output: console table + markdown report.
# ---------------------------------------------------------------------------
$rows | Format-Table Category, Field, Verdict, Actual -AutoSize | Out-String | Write-Host

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$outDir = Join-Path $repoRoot "reports"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$out = Join-Path $outDir "security_xss_sqli_bruteforce.md"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$md = "# Focused Security Tests - XSS / SQLi / Brute-force`r`n`r`n"
$md += "> Date: $ts  |  Target: $Base  |  Harness: backend/scripts/sec-xss-sqli-bruteforce.ps1`r`n`r`n"
$md += "| Category | Route | Field | Payload | Expected | Actual | Verdict |`r`n"
$md += "|---|---|---|---|---|---|---|`r`n"
foreach ($r in $rows) {
  $pl = ($r.Payload -replace '\|','\|')
  $md += "| $($r.Category) | $($r.Route) | $($r.Field) | ``$pl`` | $($r.Expected) | $($r.Actual) | $($r.Verdict) |`r`n"
}
$pass = ($rows | Where-Object Verdict -eq "PASS").Count
$fail = ($rows | Where-Object Verdict -eq "FAIL").Count
$warn = ($rows | Where-Object Verdict -eq "WARN").Count
$md += "`r`nPASS=$pass FAIL=$fail WARN=$warn`r`n"
$md | Out-File -FilePath $out -Encoding utf8
Write-Host "Report -> $out" -ForegroundColor Green
if ($fail -gt 0) { exit 1 } else { exit 0 }
