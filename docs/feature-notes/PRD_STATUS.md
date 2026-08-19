# PRD Status — Why-PII? Wi-Fi Security Assessment Tool

> **Generated:** 2026-06-07
> **Branch:** mico-testing-branch
> **Source:** Whitebox assessment (TESTING_DELIVERABLES.md § 6-F) + codebase verification

---

## ✅ Fixed Since Whitebox Assessment

| Item | Severity | Source |
|------|----------|--------|
| Debug cookie `console.log` removed from `authController.js` (lines 205, 216–217) | CRITICAL | WB-C2 |
| `authValidator.login` wired to `POST /api/auth/login` route | HIGH | WB-C4 |
| `express.json({ limit: '100kb' })` set in `server.js` | MEDIUM | Immediate list |
| `userController.js` — `err.message` leak removed | HIGH | WB-C3 partial |
| `createUserValidator` / `insertMetadataValidator` — dead validator files still exist but `authValidator` wired | HIGH | WB-C4 partial |
| New test files added: `portalTipResolver`, `riskPipeline.portalTipset`, `apJobStore`, `threatMerge`, `threatPersistence` | — | Phase 6 sprint |

---

## ❌ Still Missing

### Security — Critical / High (P0)

#### 1. `requireActiveProfile` Not Applied to Any Route (WB-C1)

**Severity:** CRITICAL (mitigated to HIGH by SEC-001 password scramble)
**File:** `backend/middleware/statusMiddleware.js` — defined but never imported in any route file.

- Inactive / on_hold / suspended users retain full API access until JWT expires (~1h)
- Middleware exists and works — it is simply never mounted
- **Fix:** Add `requireActiveProfile` after `authJWT` on all protected route groups, or fold status check into `authJWT`

#### 2. `err.message` Leaks in `rasPiController.js` (WB-C3)

**Severity:** HIGH
**File:** `backend/controllers/rasPiController.js` — lines 59, 336

```javascript
// line 59
meta: { error: err.message },

// line 336
meta: { error: err.message },
```

- Supabase constraint violations, Postgres errors, or internal URLs may reach client
- **Fix:** Replace with generic string e.g. `"INTERNAL_ERROR"` or `"PI_ERROR"`

#### 3. `createUserValidator` / `insertMetadataValidator` Still Unwired (WB-C4)

**Severity:** HIGH
**Files:** `backend/validators/userValidators.js`, `backend/validators/rasPiValidator.js`

- Both validator modules exist but are never imported in route files
- No type / length / charset validation on `city`, `province`, `notes`, `ssid`, `bssid`, `channel`
- **Fix:** Wire into `rasPiRoutes.js` and user profile routes, or delete dead files

---

### Tests — Zero Coverage (P1 Controllers)

| Controller | File | Coverage | Missing Tests |
|------------|------|----------|---------------|
| `rasPiController` | `backend/controllers/rasPiController.js` | ❌ ZERO | `triggerScan`, `saveNetworkMetadataScan`, `getNetworks`, `getNetworksById` |
| `userController` | `backend/controllers/userController.js` | ❌ ZERO | CRUD, role checks, field allowlist, self-deletion guard |
| `detectController` | `backend/controllers/detectController.js` | ❌ ZERO | `startDetection`, `stopDetection`, `heartbeat`, `poll` |
| `captivePortalController` | `backend/controllers/captivePortalController.js` | ❌ ZERO | All 11 captive portal endpoints |
| `dashboardController` | `backend/controllers/dashboardController.js` | ❌ ZERO | Summary, network list, parallel queries |
| `historyController` | `backend/controllers/historyController.js` | ❌ ZERO | Vulnerability/threat history queries |
| `auditController` | `backend/controllers/auditController.js` | ❌ ZERO | Pagination, search, date filters, export, archive |

---

### Tests — Zero Coverage (P2 Utils / Services)

| Module | Coverage | Missing Tests |
|--------|----------|---------------|
| `detectStateService.js` | ❌ ZERO | Optimistic locking, retry logic, race conditions, heartbeat timeout |
| `riskPipeline.js` (full) | ❌ ZERO | Bucket derivation, portal patching, cooldown |
| `piFetch.js` | ❌ ZERO | HMAC generation, timeout handling, signing skip in dev |
| `auditLogger.js` | ❌ ZERO | Insert failure → silent catch, old/new value serialization |
| `auditRepository.js` | ❌ ZERO | SQL whitelist, pagination, date range filtering |

---

### Tests — Missing Test Types

| Type | Priority | Estimated Cases | Description |
|------|----------|----------------|-------------|
| `requireActiveProfile` enforcement | P0 | ~8 | Inactive user with valid JWT → 403 on each protected route group |
| Error leak regression | P0 | ~12 | Trigger 500 on each controller → verify no `err.message` in response body |
| Input validation | P0 | ~20 | Oversized strings (100KB), wrong types (`channel = "abc"`), null bytes, unicode edge cases on `rasPi`, `captivePortal`, `user` endpoints |
| `userController` CRUD | P1 | ~10 | Create, read, update (field allowlist), delete (self-deletion guard), role check |
| `detectController` lifecycle | P1 | ~8 | Start → heartbeat → poll → stop with mocked Pi |
| `auditController` queries | P1 | ~8 | Pagination boundaries, search injection, date range, export format |
| `captivePortalController` | P1 | ~12 | CRUD for announcements, terms, tips, risk-classifications, sync |
| `detectStateService` concurrency | P2 | ~6 | Concurrent `startOrSwitch` calls, lock conflict, retry exhaustion |
| `riskPipeline` edge cases | P2 | ~8 | Bucket derivation, version bumping, portal patch cooldown |
| `piFetch` signing | P2 | ~6 | HMAC format, timeout, dev-mode signing skip |
| `auditLogger` failure modes | P2 | ~5 | Insert failure → silent catch, entity ID fallback |
| AP lock TTL | P3 | ~3 | Lock acquired → crash simulation → verify auto-release |
| E2E auth flow | P3 | ~4 | Login → dashboard → refresh → logout → protected page redirect |

**Estimated total missing:** ~130 test cases across 13 components

---

### Frontend — Low Severity Gaps (WB-F2)

| Finding | File | Severity | Fix |
|---------|------|----------|-----|
| `localStorage` for BSSID "cleared" timestamps | `src/hooks/useSAM.js` lines 131, 149 | LOW | Switch to `sessionStorage` for tab-scope isolation |
| Debug `console.log` (2 occurrences) | `src/api/rasPiApi.js` | LOW | Remove or wrap in `import.meta.env.DEV` |
| Debug `console.log` present | `src/hooks/useDevice.js`, `src/hooks/useSAM.js` | LOW | Remove or wrap in `import.meta.env.DEV` |
| Raw backend error displayed to user | `src/pages/AccountsAudit/AccountsAudit.jsx` | LOW | Sanitize before display |

---

## Priority Summary

| Priority | Count | Items |
|----------|-------|-------|
| **P0 — Before production** | 3 | `requireActiveProfile`, `err.message` leaks in `rasPiController`, wire validators |
| **P1 — Next sprint** | 4 | Controller tests: `user`, `detect`, `audit`, `captivePortal` |
| **P2 — Medium-term** | 5 | Utils: `detectStateService`, `riskPipeline`, `piFetch`, `auditLogger`, `auditRepository` |
| **P3 — Nice to have** | 2 | AP lock TTL test, E2E auth flow |
| **Frontend** | 4 | `localStorage` → `sessionStorage`, strip debug logs, sanitize error display |

---

## Current Test Inventory (for reference)

| Suite | File | Tests |
|-------|------|-------|
| Unit — scoring | `scoring.test.js` | 20 |
| Unit — normalization | `normalization.test.js` | 20 |
| Unit — sorting | `sorting.test.js` | 16 |
| Unit — exportFormatters | `exportFormatters.test.js` | 14 |
| Unit — scanValidation | `scanValidation.test.js` | 17 |
| Unit — signing | `signing.test.js` | ~8 |
| Unit — apJobStore | `apJobStore.test.js` | — |
| Unit — threatMerge | `threatMerge.test.js` | — |
| Unit — threatPersistence | `threatPersistence.test.js` | — |
| Unit — portalTipResolver | `portalTipResolver.test.js` | — |
| Unit — riskPipeline.portalTipset | `riskPipeline.portalTipset.test.js` | — |
| Integration — auth | `auth.test.js` | 7 |
| Integration — authorization | `authorization.test.js` | 8 |
| Integration — deviceMgmt | `deviceMgmt.test.js` | 16 |
| Integration — scanIngestion | `scanIngestion.test.js` | 6 |
| E2E — Playwright | device management golden path | 4 |
