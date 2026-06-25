# Focused Security Tests - XSS / SQLi / Brute-force

> Date: 2026-06-25 22:06:42  |  Target: http://localhost:3000  |  Harness: backend/scripts/sec-xss-sqli-bruteforce.ps1

| Category | Route | Field | Payload | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|
| SQL Injection | POST /api/auth/login | email (classic OR-true) | `x' OR '1'='1` | Reject (400/401), no token, no DB error leaked | HTTP 400; bypass=False; dbLeak=False | PASS |
| SQL Injection | POST /api/auth/login | email (comment-out password) | `admin'--` | Reject (400/401), no token, no DB error leaked | HTTP 400; bypass=False; dbLeak=False | PASS |
| SQL Injection | POST /api/auth/login | email (stacked query probe) | `x'; SELECT 1;--` | Reject (400/401), no token, no DB error leaked | HTTP 400; bypass=False; dbLeak=False | PASS |
| XSS (reflected) | POST /api/auth/login | email | `<script>alert(1)</script>` | Payload not reflected unescaped; JSON response | HTTP 400; rawPayloadReflected=False | PASS |
| XSS (reflected) | POST /api/auth/login | email | `"><img src=x onerror=alert(1)>` | Payload not reflected unescaped; JSON response | HTTP 400; rawPayloadReflected=False | PASS |
| Brute-force | POST /api/auth/login | email/password | `12 rapid wrong logins (1 email)` | 429 Too Many Requests before burst ends | 429 at attempt 6/12 | PASS |

PASS=6 FAIL=0 WARN=0

## Mitigation status (all already implemented)

| Control | Mitigation in place | Evidence (source) |
|---|---|---|
| SQL Injection | (1) Email-format validation rejects malformed input with **400 before auth** (`loginValidation, validate` on the route). (2) All DB access via Supabase JS SDK — parameterized, **zero raw SQL** (CLAUDE.md non-negotiable). (3) Global error handler returns only `{error,message}` — no DB error leak. | `backend/routes/authRoutes.js:9`, `backend/validators/authValidator.js`, `backend/server.js` error handler |
| XSS (reflected) | (1) API responds `application/json`, never HTML — nothing to reflect into a page. (2) React auto-escapes interpolated text on render. (3) `sanitizeString()` HTML-entity-encodes stored input. (4) CSP `script-src 'self'` blocks inline script execution even if injected. | `backend/utils/normalization.js`, React render layer, prod CSP |
| Brute-force | `loginLimiter` (express-rate-limit) caps **10 login attempts / 15 min / IP**, returns 429. Probe hit 429 at attempt 6 (counter shared with prior probes in window). | `backend/middleware/rateLimiter.js:8-14`, `backend/routes/authRoutes.js:9` |

**No new mitigation required** — all three controls verified active against live local backend. Note: rate limiter is in-memory (resets on restart, not multi-instance safe) — known limitation per CLAUDE.md, acceptable for single-instance.

## Notes / scope

- Probes are **non-destructive**: malformed-input rejection probes + a capped 12-attempt burst against one throwaway email. No password lists, no real accounts, no data mutation.
- SQLi/XSS returned **400 (validation)** rather than 401 — the input validator is the first defense layer and never lets the payload reach the auth/DB path. Both are correct PASS outcomes.
- Stored/persisted XSS (e.g. profile display name) and authenticated-route SQLi were **not** exercised here (require an authenticated session). The structural mitigations above (SDK parameterization, React escaping, `sanitizeString`) cover them; recommend a follow-up authenticated pass with a dedicated test account if deeper coverage is wanted.

