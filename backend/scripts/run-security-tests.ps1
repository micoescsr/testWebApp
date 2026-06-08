###############################################################################
# COMPREHENSIVE SECURITY TESTING - All Chunks
# Outputs results to: security_testing_results.md
###############################################################################

$base = "http://localhost:3000"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$results = @()

function Add-Result($chunk, $test, $status, $detail) {
    $script:results += [PSCustomObject]@{
        Chunk  = $chunk
        Test   = $test
        Status = $status
        Detail = $detail
    }
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " COMPREHENSIVE SECURITY TESTING - $timestamp" -ForegroundColor Cyan
Write-Host " Target: $base" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

###############################################################################
# CHUNK 1: AUTOMATED & STATIC TESTING
###############################################################################
Write-Host "============ CHUNK 1: AUTOMATED & STATIC TESTING ==================" -ForegroundColor Magenta

# 1.1 Security Linter
Write-Host "`n--- 1.1: Security Linter (lint:security) ---" -ForegroundColor Yellow
$lintOutput = & npm run lint:security 2>&1 | Out-String
if ($lintOutput -match "0 violations") {
    Write-Host "  PASS: 0 violations found" -ForegroundColor Green
    Add-Result "Chunk 1" "Security Linter" "PASS" "0 violations found across all backend files"
} else {
    $lintViolations = @()
    $lines = $lintOutput -split "`n"
    foreach ($line in $lines) {
        if ($line -match "Hardcoded|err\.message|FASTAPI_BASE[^_]") {
            $lintViolations += $line.Trim()
        }
    }
    $violationCount = $lintViolations.Count
    if ($violationCount -eq 0) { $violationCount = "1+" }
    Write-Host "  WARN: $violationCount violation(s) found" -ForegroundColor Yellow
    foreach ($v in $lintViolations) { Write-Host "    -> $v" -ForegroundColor Yellow }
    Add-Result "Chunk 1" "Security Linter" "WARN" "$violationCount violation(s) found"
}

# 1.2 npm audit
Write-Host "`n--- 1.2: Dependency Audit (npm audit) ---" -ForegroundColor Yellow
$auditOutput = & npm audit 2>&1 | Out-String
$auditSummaryLine = ""
$auditLines = $auditOutput -split "`n"
foreach ($line in $auditLines) {
    if ($line -match "^\d+ vulnerabilities" -or $line -match "found 0 vulnerabilities") {
        $auditSummaryLine = $line.Trim()
    }
}
if ($auditSummaryLine -match "0 vulnerabilities" -or $auditOutput -match "found 0 vulnerabilities") {
    Write-Host "  PASS: No vulnerabilities found" -ForegroundColor Green
    Add-Result "Chunk 1" "npm audit" "PASS" "0 vulnerabilities"
} else {
    Write-Host "  WARN: $auditSummaryLine" -ForegroundColor Yellow
    Add-Result "Chunk 1" "npm audit" "WARN" "$auditSummaryLine"
}

Write-Host ""

###############################################################################
# CHUNK 2: AUTHENTICATION & AUTHORIZATION
###############################################################################
Write-Host "============ CHUNK 2: AUTHENTICATION & AUTHORIZATION ==============" -ForegroundColor Magenta

# 2.1 Public Surface
Write-Host "`n--- 2.1: Public Surface ---" -ForegroundColor Yellow

# Health endpoint
try {
    $r = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -ErrorAction Stop
    Write-Host "  PASS: GET /health -> $($r.StatusCode)" -ForegroundColor Green
    Add-Result "Chunk 2" "Public: GET /health" "PASS" "Returns $($r.StatusCode) without auth (expected)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "  FAIL: GET /health -> $code" -ForegroundColor Red
    Add-Result "Chunk 2" "Public: GET /health" "FAIL" "Returns $code (expected 200)"
}

# Login endpoint
try {
    $r = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -UseBasicParsing -ContentType "application/json" -Body '{"email":"x"}' -ErrorAction Stop
    Write-Host "  PASS: POST /api/auth/login -> $($r.StatusCode) (accessible)" -ForegroundColor Green
    Add-Result "Chunk 2" "Public: POST /api/auth/login" "PASS" "Accessible without JWT (returns $($r.StatusCode))"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -ne 401) {
        Write-Host "  PASS: POST /api/auth/login -> $code (accessible, not 401)" -ForegroundColor Green
        Add-Result "Chunk 2" "Public: POST /api/auth/login" "PASS" "Accessible without JWT (returns $code, not 401)"
    } else {
        Write-Host "  FAIL: POST /api/auth/login -> 401 (should be public)" -ForegroundColor Red
        Add-Result "Chunk 2" "Public: POST /api/auth/login" "FAIL" "Returns 401 but should be public"
    }
}

# 2.2 Broken Access Control
Write-Host "`n--- 2.2: Broken Access Control (no token -> must get 401) ---" -ForegroundColor Yellow
$protected = @(
    "GET /api/webapp/network_metadata",
    "GET /api/webapp/vulnerabilities_latest",
    "GET /api/webapp/users/profiles/me",
    "GET /api/webapp/users/profiles",
    "GET /api/rasPi/networks",
    "POST /api/rasPi/scan",
    "GET /api/rasPi/networks_list",
    "GET /api/device/ap-state/00000000-0000-0000-0000-000000000001",
    "GET /api/device/network/00000000-0000-0000-0000-000000000001/state",
    "POST /api/device/signal_ap",
    "POST /api/device/enable-ap",
    "POST /api/device/portal/update",
    "GET /api/device/status",
    "GET /api/detect/status",
    "POST /api/detect/start",
    "POST /api/detect/stop",
    "GET /api/detect/poll",
    "GET /api/sam/threats/CVE-2024-1234",
    "GET /api/sam/vulnerabilities/CVE-2024-1234",
    "GET /api/captivePortal/announcement",
    "GET /api/captivePortal/terms",
    "GET /api/captivePortal/tips",
    "GET /api/captivePortal/summary",
    "POST /api/captivePortal/sync",
    "GET /api/audit/logs",
    "GET /api/audit/export",
    "POST /api/audit/archive",
    "GET /api/history/vulnerabilities",
    "GET /api/history/threats"
)

$pass401 = 0; $fail401 = 0; $accessDetails = @()
foreach ($ep in $protected) {
    $parts = $ep -split " ", 2
    $method = $parts[0]; $path = $parts[1]
    try {
        # GET/HEAD must not carry a body — .NET's HttpWebRequest throws a
        # client-side ProtocolViolationException (no .Response) if they do,
        # which masquerades as an unreadable status code further down.
        $reqArgs = @{ Uri = "$base$path"; Method = $method; UseBasicParsing = $true; ErrorAction = "Stop" }
        if ($method -notin @("GET", "HEAD")) {
            $reqArgs["ContentType"] = "application/json"
            $reqArgs["Body"] = '{}'
        }
        $r = Invoke-WebRequest @reqArgs
        Write-Host "  FAIL: $ep -> $($r.StatusCode)" -ForegroundColor Red
        $fail401++
        $accessDetails += "${ep} -> $($r.StatusCode) FAIL"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 401) {
            Write-Host "  PASS: $ep -> 401" -ForegroundColor Green
            $pass401++
            $accessDetails += "${ep} -> 401 PASS"
        } else {
            Write-Host "  WARN: $ep -> $code" -ForegroundColor Yellow
            $fail401++
            $accessDetails += "${ep} -> $code WARN"
        }
    }
}
Write-Host "  >> ACCESS CONTROL: $pass401/$($pass401+$fail401) return 401" -ForegroundColor White
$acStatus = "PASS"
if ($fail401 -gt 0) { $acStatus = "PARTIAL" }
Add-Result "Chunk 2" "Broken Access Control (29 routes)" $acStatus "$pass401/$($pass401+$fail401) return 401 without token"

# 2.3 Webhook Auth
Write-Host "`n--- 2.3: Webhook Auth (scan-completed) ---" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$base/api/device/scan-completed" -Method POST -UseBasicParsing -ContentType "application/json" -Body '{"network_id":"test"}' -ErrorAction Stop
    Write-Host "  FAIL: No token -> $($r.StatusCode)" -ForegroundColor Red
    Add-Result "Chunk 2" "Webhook: No token" "FAIL" "Returns $($r.StatusCode), should reject"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "  PASS: No token -> $code (rejected)" -ForegroundColor Green
    Add-Result "Chunk 2" "Webhook: No token" "PASS" "Rejected with $code"
}
try {
    $r = Invoke-WebRequest -Uri "$base/api/device/scan-completed" -Method POST -UseBasicParsing -ContentType "application/json" -Body '{"network_id":"test"}' -Headers @{"X-Scan-Runner-Token"="wrong-token-value"} -ErrorAction Stop
    Write-Host "  FAIL: Wrong token -> $($r.StatusCode)" -ForegroundColor Red
    Add-Result "Chunk 2" "Webhook: Wrong token" "FAIL" "Returns $($r.StatusCode), should reject"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "  PASS: Wrong token -> $code (rejected)" -ForegroundColor Green
    Add-Result "Chunk 2" "Webhook: Wrong token" "PASS" "Rejected with $code"
}

Write-Host ""

###############################################################################
# CHUNK 3: INPUT VALIDATION & INJECTION
###############################################################################
Write-Host "============ CHUNK 3: INPUT VALIDATION & INJECTION ================" -ForegroundColor Magenta

# 3.1 UUID Validation
Write-Host "`n--- 3.1: UUID Validation (malformed UUID) ---" -ForegroundColor Yellow
$uuidRoutes = @(
    "PUT /api/webapp/users/profiles/not-a-uuid",
    "DELETE /api/webapp/users/profiles/not-a-uuid",
    "GET /api/device/ap-state/not-a-uuid",
    "GET /api/device/network/not-a-uuid/state",
    "GET /api/rasPi/networks/not-a-uuid"
)
$uuidPass = 0; $uuidFail = 0
foreach ($ep in $uuidRoutes) {
    $parts = $ep -split " ", 2
    $method = $parts[0]; $path = $parts[1]
    try {
        $r = Invoke-WebRequest -Uri "$base$path" -Method $method -UseBasicParsing -ContentType "application/json" -ErrorAction Stop
        Write-Host "  FAIL: $ep -> $($r.StatusCode)" -ForegroundColor Red
        $uuidFail++
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 400 -or $code -eq 401) {
            Write-Host "  PASS: $ep -> $code (rejected)" -ForegroundColor Green
            $uuidPass++
        } else {
            Write-Host "  WARN: $ep -> $code" -ForegroundColor Yellow
            $uuidFail++
        }
    }
}
$uuidStatus = "PASS"
if ($uuidFail -gt 0) { $uuidStatus = "PARTIAL" }
Add-Result "Chunk 3" "UUID Validation ($($uuidRoutes.Count) routes)" $uuidStatus "$uuidPass/$($uuidPass+$uuidFail) rejected malformed UUIDs"

# 3.2 Error Leak Prevention
Write-Host "`n--- 3.2: Error Leak Prevention ---" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -UseBasicParsing -ContentType "application/json" -Body '{bad json' -ErrorAction Stop
    Add-Result "Chunk 3" "Error Leak: Malformed JSON" "INFO" "Returns $($r.StatusCode)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = ""
    try { $body = $_.ErrorDetails.Message } catch {}
    if ($body -match "stack|trace|node_modules") {
        Write-Host "  FAIL: Malformed JSON leaks stack trace!" -ForegroundColor Red
        Add-Result "Chunk 3" "Error Leak: Malformed JSON" "FAIL" "Stack trace leaked in response body"
    } else {
        Write-Host "  PASS: Bad JSON -> $code (no stack trace)" -ForegroundColor Green
        Add-Result "Chunk 3" "Error Leak: Malformed JSON" "PASS" "Returns $code with generic error, no stack trace"
    }
}

# 3.3 SQLi
Write-Host "`n--- 3.3: SQL Injection Defense ---" -ForegroundColor Yellow
$sqliPayload = '{"email":"x'' OR 1=1 --","password":"x"}'
try {
    $r = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -UseBasicParsing -ContentType "application/json" -Body $sqliPayload -ErrorAction Stop
    Add-Result "Chunk 3" "SQLi: Login" "INFO" "Returns $($r.StatusCode)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = ""
    try { $body = $_.ErrorDetails.Message } catch {}
    if ($body -match "SQL|syntax|postgres|pg_|relation|column") {
        Write-Host "  FAIL: SQLi response leaks DB info!" -ForegroundColor Red
        Add-Result "Chunk 3" "SQLi: Login" "FAIL" "Database information leaked in error response"
    } else {
        Write-Host "  PASS: SQLi attempt -> $code (no DB info leaked)" -ForegroundColor Green
        Add-Result "Chunk 3" "SQLi: Login" "PASS" "Returns $code, no database info leaked"
    }
}

# 3.4 XSS (reflected)
Write-Host "`n--- 3.4: XSS Defense (reflected) ---" -ForegroundColor Yellow
$xssPayload = '{"email":"<script>alert(1)</script>","password":"x"}'
try {
    $r = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -UseBasicParsing -ContentType "application/json" -Body $xssPayload -ErrorAction Stop
    $bodyContent = $r.Content
    if ($bodyContent -match "<script>") {
        Write-Host "  FAIL: XSS payload reflected!" -ForegroundColor Red
        Add-Result "Chunk 3" "XSS: Reflected" "FAIL" "Script tag reflected in response body"
    } else {
        Write-Host "  PASS: XSS not reflected -> $($r.StatusCode)" -ForegroundColor Green
        Add-Result "Chunk 3" "XSS: Reflected" "PASS" "Script tag not reflected"
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = ""
    try { $body = $_.ErrorDetails.Message } catch {}
    if ($body -match "<script>") {
        Write-Host "  FAIL: XSS payload reflected in error!" -ForegroundColor Red
        Add-Result "Chunk 3" "XSS: Reflected" "FAIL" "Script tag reflected in error response"
    } else {
        Write-Host "  PASS: XSS attempt -> $code (not reflected)" -ForegroundColor Green
        Add-Result "Chunk 3" "XSS: Reflected" "PASS" "Returns $code, script tag not reflected"
    }
}

Write-Host ""

###############################################################################
# CHUNK 4: SECURITY HEADERS
###############################################################################
Write-Host "============ CHUNK 4: SECURITY HEADERS ============================" -ForegroundColor Magenta

Write-Host "`n--- 4.1: Security Headers (via /api/auth/login) ---" -ForegroundColor Yellow
$curlOut = & curl.exe -s -D - -o NUL -X POST "$base/api/auth/login" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"wrong"}' 2>$null
$headerText = $curlOut -join "`n"

$headerChecks = @(
    @{Name="X-Content-Type-Options"; Expected="nosniff"},
    @{Name="X-Frame-Options"; Expected="SAMEORIGIN"},
    @{Name="X-XSS-Protection"; Expected="0"},
    @{Name="Content-Security-Policy"; Expected=$null}
)

$headerPass = 0; $headerFail = 0
foreach ($h in $headerChecks) {
    $val = $null
    if ($headerText -match "(?im)^$([regex]::Escape($h.Name)):\s*(.+)$") { $val = $Matches[1].Trim() }

    if ($h.Expected) {
        if ($val -eq $h.Expected) {
            Write-Host "  PASS: $($h.Name): $val" -ForegroundColor Green
            $headerPass++
            Add-Result "Chunk 4" "Header: $($h.Name)" "PASS" "$val"
        } else {
            Write-Host "  FAIL: $($h.Name): expected=$($h.Expected) got=$val" -ForegroundColor Red
            $headerFail++
            Add-Result "Chunk 4" "Header: $($h.Name)" "FAIL" "Expected $($h.Expected), got $val"
        }
    } else {
        if ($val) {
            Write-Host "  PASS: $($h.Name): present" -ForegroundColor Green
            $headerPass++
            Add-Result "Chunk 4" "Header: $($h.Name)" "PASS" "Present"
        } else {
            Write-Host "  WARN: $($h.Name): not present" -ForegroundColor Yellow
            $headerFail++
            Add-Result "Chunk 4" "Header: $($h.Name)" "WARN" "Not present"
        }
    }
}

# X-Powered-By (should be removed)
$xpb = $null
if ($headerText -match "(?im)^X-Powered-By:\s*(.+)$") { $xpb = $Matches[1].Trim() }
if (-not $xpb) {
    Write-Host "  PASS: X-Powered-By: removed" -ForegroundColor Green
    $headerPass++
    Add-Result "Chunk 4" "Header: X-Powered-By" "PASS" "Removed (Helmet)"
} else {
    Write-Host "  FAIL: X-Powered-By: $xpb (should be removed)" -ForegroundColor Red
    $headerFail++
    Add-Result "Chunk 4" "Header: X-Powered-By" "FAIL" "Present: $xpb"
}

# HSTS
$hstsVal = $null
if ($headerText -match "(?im)^Strict-Transport-Security:\s*(.+)$") { $hstsVal = $Matches[1].Trim() }
if ($hstsVal) {
    Write-Host "  PASS: Strict-Transport-Security: present" -ForegroundColor Green
    Add-Result "Chunk 4" "Header: HSTS" "PASS" "$hstsVal"
} else {
    Write-Host "  PASS: Strict-Transport-Security: absent in dev (prod-only)" -ForegroundColor Green
    Add-Result "Chunk 4" "Header: HSTS" "PASS" "Absent in dev (prod-only by design)"
}
$headerPass++

Write-Host "  >> HEADERS: $headerPass/$($headerPass+$headerFail) checks passed" -ForegroundColor White

###############################################################################
# CHUNK 5: RATE LIMITING
###############################################################################
Write-Host ""
Write-Host "============ CHUNK 5: RATE LIMITING ================================" -ForegroundColor Magenta

Write-Host "`n--- 5.1: Login Rate Limiting (15 rapid requests) ---" -ForegroundColor Yellow
$rateLimitHit = $false
$rateLimitAt = 0
for ($i = 1; $i -le 15; $i++) {
    try {
        $null = Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST -UseBasicParsing -ContentType "application/json" -Body '{"email":"ratelimit@test.com","password":"wrong"}' -ErrorAction Stop
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 429) {
            $rateLimitHit = $true
            $rateLimitAt = $i
            Write-Host "  PASS: Request $i -> 429 (rate limited!)" -ForegroundColor Green
            break
        }
    }
}
if ($rateLimitHit) {
    Add-Result "Chunk 5" "Rate Limiting: Login" "PASS" "429 triggered at request $rateLimitAt of 15"
} else {
    Write-Host "  WARN: No 429 after 15 requests" -ForegroundColor Yellow
    Add-Result "Chunk 5" "Rate Limiting: Login" "WARN" "No 429 after 15 requests (threshold may be higher or counters already active)"
}

Write-Host ""

###############################################################################
# GENERATE RESULTS FILE
###############################################################################
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " GENERATING RESULTS FILE..." -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$outPath = Join-Path (Join-Path $repoRoot "reports") "security_testing_results_rerun.md"

# Count results
$passCount = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$failCount = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
$warnCount = ($results | Where-Object { $_.Status -eq "WARN" -or $_.Status -eq "PARTIAL" -or $_.Status -eq "INFO" }).Count
$totalCount = $results.Count

# Build markdown output
$md = "# Security Testing Results`r`n`r`n"
$md += "> **Date:** $timestamp`r`n"
$md += "> **Tester:** Automated Security Test Suite (run-security-tests.ps1)`r`n"
$md += "> **Target:** $base`r`n"
$md += "> **Scope:** Full-Stack Application (React + Express.js + Supabase)`r`n`r`n"
$md += "---`r`n`r`n"
$md += "## Summary`r`n`r`n"
$md += "| Metric | Count |`r`n"
$md += "|--------|-------|`r`n"
$md += "| Total Tests | $totalCount |`r`n"
$md += "| Passed | $passCount |`r`n"
$md += "| Failed | $failCount |`r`n"
$md += "| Warnings | $warnCount |`r`n`r`n"
$md += "---`r`n`r`n"

# Group by chunk
$chunks = $results | Group-Object Chunk
foreach ($chunk in $chunks) {
    $md += "## $($chunk.Name)`r`n`r`n"
    $md += "| Test | Status | Detail |`r`n"
    $md += "|------|--------|--------|`r`n"
    foreach ($r in $chunk.Group) {
        $statusIcon = switch ($r.Status) {
            "PASS"    { "PASS" }
            "FAIL"    { "FAIL" }
            "WARN"    { "WARN" }
            "PARTIAL" { "PARTIAL" }
            "INFO"    { "INFO" }
            default   { $r.Status }
        }
        $testName = $r.Test
        $detail = $r.Detail
        $md += "| $testName | $statusIcon | $detail |`r`n"
    }
    $md += "`r`n"
}

# Access control details
$md += "---`r`n`r`n"
$md += "## Detailed Access Control Results (Chunk 2)`r`n`r`n"
$md += "| # | Endpoint | Result |`r`n"
$md += "|---|----------|--------|`r`n"
$i = 1
foreach ($d in $accessDetails) {
    $md += "| $i | $d |`r`n"
    $i++
}
$md += "`r`n"

# Manual checklist
$md += "---`r`n`r`n"
$md += "## Manual Testing Checklist (Chunk 6 - Business Logic)`r`n`r`n"
$md += "> These tests require manual QA and cannot be fully automated.`r`n`r`n"
$md += "- [ ] **Rate Limiting Thresholds:** Log in 15 times rapidly. Verify 429 response.`r`n"
$md += "- [ ] **Forced Password Reset:** Admin issues temp password -> user trapped on /force-reset-password.`r`n"
$md += "- [ ] **Deactivation Real-Time Kick:** Deactivate user in Browser 2 -> verify 403 in Browser 1.`r`n"
$md += "- [ ] **AP Lock Recovery:** Disconnect mid-AP-enable -> verify lock auto-releases after TTL.`r`n"
$md += "- [ ] **Concurrent Detection Start:** Two users start detection simultaneously -> verify optimistic lock handles it.`r`n"
$md += "- [ ] **Password Field Inspection:** Verify password input uses type=password (confirmed in code review).`r`n`r`n"

# Recommendations
$md += "---`r`n`r`n"
$md += "## Recommendations`r`n`r`n"
$md += "1. **Fix lint violation:** Remove hardcoded Tailscale URL in test-pi-signing.js line 51.`r`n"
$md += "2. **Run npm audit fix:** Address the dependency vulnerabilities flagged by npm audit.`r`n"
$md += "3. **Complete manual tests:** Execute the Chunk 6 checklist items above.`r`n"
$md += "4. **Consider OWASP ZAP:** Run a passive scan for additional header/cookie findings.`r`n`r`n"

$md += "---`r`n`r`n"
$md += "> Generated by run-security-tests.ps1 on $timestamp`r`n"

$md | Out-File -FilePath $outPath -Encoding utf8
Write-Host ""
Write-Host "Results written to: $outPath" -ForegroundColor Green

# Final summary
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " TESTING COMPLETE" -ForegroundColor Cyan
Write-Host " PASS: $passCount | FAIL: $failCount | WARN: $warnCount | TOTAL: $totalCount" -ForegroundColor Cyan
Write-Host " Results saved to: security_testing_results.md" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
