# WhyPII — Test Suite Documentation

## Unit Tests & Integration Tests

**Version:** 2.0.0
**Date:** February 24, 2026
**Authors:** WhyPII Development Team
**Framework:** Jest 30 · supertest 7 · Playwright 1.x · Node.js

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & Design Decisions](#2-architecture--design-decisions)
3. [Directory Structure](#3-directory-structure)
4. [Test Categories](#4-test-categories)
   - 4.1 [Unit Tests](#41-unit-tests)
   - 4.2 [Integration Tests](#42-integration-tests)
   - 4.3 [E2E Tests (Playwright)](#43-e2e-tests-playwright)
5. [Test Inventory](#5-test-inventory)
6. [Fixtures & Helpers](#6-fixtures--helpers)
7. [Extracted Utility Modules](#7-extracted-utility-modules)
8. [Running the Tests](#8-running-the-tests)
9. [Coverage & Thresholds](#9-coverage--thresholds)
10. [Mocking Strategy](#10-mocking-strategy)
11. [CI / CD Integration](#11-ci--cd-integration)
12. [Extending the Suite](#12-extending-the-suite)
13. [Known Limitations & Future Work](#13-known-limitations--future-work)

---

## 1. Overview

This document describes the testing strategy for the **WhyPII** backend. The goal is to **lock down core logic during refactoring** so regressions are caught immediately, while verifying that the **critical paths** (auth, scan ingestion, authorization) work end-to-end through the Express middleware stack.

The suite is designed for **short-timeframe, high-value** coverage: every test targets a function or route that, if broken, would silently corrupt data or block users.

| Metric | Target |
|---|---|
| Unit tests | 132 cases across 5 suites |
| Integration tests | 43 scenario tests across 4 suites |
| Total (backend) | **175 tests, 9 suites, 0 failures** |
| E2E tests (Playwright) | 4 golden-path flows (chromium) |
| Coverage (utils/) | 99 % statements, 87 % branches, 100 % functions |
| Coverage (middleware/) | 92 % statements, 80 % branches, 100 % functions |
| Execution time | ~2 s backend (mocked I/O) |

---

## 2. Architecture & Design Decisions

### 2.1 Why Jest?

- Native support for CommonJS (the backend uses `require`).
- Built-in mocking (`jest.mock`, `jest.fn`, `jest.spyOn`).
- Parallel test runners and snapshot support for future expansion.

### 2.2 Why supertest?

- Allows sending HTTP requests to an Express `app` instance **without starting a TCP server**.
- `supertest.agent()` preserves cookies across requests, enabling full session-flow testing.

### 2.3 DB Mocking (Option 1 — Mock at Repository Layer)

Integration tests hit **real Express routes and middleware** but **stub the Supabase client** at the module level. This gives confidence that route → controller → middleware chains work correctly, without requiring a live database.

```
┌──────────────────────────────────────┐
│  supertest  →  Express app (real)    │
│     ├── cookieParser     (real)      │
│     ├── express.json()   (real)      │
│     ├── authMiddleware   (mocked JWT)│
│     ├── controllers      (real)      │
│     └── supabaseClient   (mocked)   │
└──────────────────────────────────────┘
```

### 2.4 Extracted Utility Modules

Pure functions were **extracted from `server.js`** into `backend/utils/` to make them independently testable. These modules have **zero I/O dependencies** and are deterministic.

---

## 3. Directory Structure

```
backend/
├── jest.config.js                   # Jest configuration
├── utils/                           # Extracted pure-function modules
│   ├── scoring.js                   #   CVSS scoring & severity
│   ├── normalization.js             #   Payload normalization & validation
│   ├── sorting.js                   #   Sort & filter functions
│   ├── exportFormatters.js          #   CSV / XLSX export helpers
│   └── scanValidation.js            #   Scan validation + portal payload builder
├── __tests__/
│   ├── setup.js                     # Global env vars for test env
│   ├── fixtures/
│   │   ├── scanPayloads.js          # Canonical scan payload fixtures
│   │   ├── threatDefinitions.js     # Threat definition mocks + poll results
│   │   └── deviceMgmtPayloads.js    # AP toggle, scan, network row fixtures
│   ├── helpers/
│   │   ├── testApp.js               # Express app factory (no listen)
│   │   └── mockSupabase.js          # Chainable Supabase client mock
│   ├── unit/
│   │   ├── scoring.test.js          # Suite A — scoring & severity
│   │   ├── normalization.test.js    # Suite B — normalization & validation
│   │   ├── sorting.test.js          # Suite C — sorting & filtering
│   │   ├── exportFormatters.test.js # Suite D — CSV / XLSX export
│   │   └── scanValidation.test.js   # Suite E — scan validation & portal payload
│   └── integration/
│       ├── auth.test.js             # Auth & session flow
│       ├── scanIngestion.test.js    # Scan pipeline ingestion
│       ├── authorization.test.js    # Role-based access control
│       └── deviceMgmt.test.js       # AP toggle, state, scan gating

(root)/
├── playwright.config.js             # Playwright E2E configuration
├── e2e/
│   ├── helpers/
│   │   └── auth.js                  # Shared login helper
│   └── device-management.spec.js    # 4 golden-path AP panel tests
```

---

## 4. Test Categories

### 4.1 Unit Tests

Unit tests validate **pure functions** with deterministic inputs — no network calls, no database, no file I/O.

| Suite | Module | Focus |
|---|---|---|
| **A. Scoring & Severity** | `utils/scoring.js` | `computeSeverityFromScore` boundary checks (3.9→4.0, 6.9→7.0, 8.9→9.0), `computeRiskScore` weighting, `mapPollResultsToThreatRows` aggregation |
| **B. Normalization & Validation** | `utils/normalization.js` | BSSID normalization (colon / dash / raw hex), payload validation (missing SSID / BSSID / channel), XSS string sanitization |
| **C. Sorting & Filtering** | `utils/sorting.js` | Sort high→low / low→high by severity & score, filter by severity / date range / category |
| **D. Export Formatting** | `utils/exportFormatters.js` | CSV header correctness, row count matching, special-character escaping (RFC 4180), XLSX row generation |
| **E. Scan Validation** | `utils/scanValidation.js` | `validateScan` — null/missing, network mismatch, freshness boundary, string coercion. `buildPortalPatchPayload` — network_id format, content structure, timestamps |

### 4.2 Integration Tests

Integration tests hit **real Express routes** through `supertest`, with external dependencies mocked.

| Suite | Routes Tested | Focus |
|---|---|---|
| **Auth & Session Flow** | `POST /api/auth/login`, `/set-refresh`, `/refresh`, `/logout` | Login → cookie set → refresh with cookie → logout clears cookie. HttpOnly flag verification. |
| **Scan Ingestion Pipeline** | `POST /api/rasPi/networks`, `POST /api/rasPi/scan` | Valid payload → 201 with computed fields. Missing fields → 400. FastAPI proxy behavior. |
| **Authorization Checks** | `GET /api/protected`, `GET /api/admin/users` | Non-admin → 403, superadmin → 200, missing token → 401, expired token → 401, profile status checks (active / on_hold / inactive). |
| **Device Management (AP Toggle)** | `GET /api/device/ap-state/:networkId`, `POST /api/device/enable-ap` | AP state from DB, scan-gated enable (SCAN_REQUIRED / SCAN_TOO_OLD / SCAN_NETWORK_MISMATCH), portal/patch before orchestrate/apply, idempotent portal init, disable without scan. |

### 4.3 E2E Tests (Playwright)

End-to-end tests run a real browser (Chromium) against the full app stack — Vite frontend + Express backend. They validate cross-page flows that unit/integration tests cannot catch.

| Test | Flow | Asserts |
|---|---|---|
| **No scan context** | Direct nav to `/device-management` | Toggle disabled or "No network selected" guard |
| **SAM → Device Mgmt** | Login → SAM scan → sidebar nav to Device Mgmt | Toggle visible and enabled, network config shown |
| **AP Info panel** | Navigate with/without network | SSID, BSSID, Channel, Encryption labels visible |
| **Go to Scan navigation** | Click "Go to Scan" button | URL changes to `/security-assessment` |

---

## 5. Test Inventory

### 5.1 Unit Test Cases

#### A. `scoring.test.js` (≈ 20 cases)

| # | Test | Expected |
|---|---|---|
| 1 | Score 0.0 → severity | `"None"` |
| 2 | Score 0.1 → severity | `"Low"` |
| 3 | Score 3.9 → severity | `"Low"` |
| 4 | **Score 4.0** → severity (boundary) | `"Medium"` |
| 5 | Score 6.9 → severity | `"Medium"` |
| 6 | **Score 7.0** → severity (boundary) | `"High"` |
| 7 | Score 8.9 → severity | `"High"` |
| 8 | **Score 9.0** → severity (boundary) | `"Critical"` |
| 9 | Score 10.0 → severity | `"Critical"` |
| 10 | Null / undefined / NaN → `"N/A"` | — |
| 11 | Negative / > 10 → `"N/A"` | — |
| 12 | String-encoded number | Parsed correctly |
| 13 | Risk score: empty findings → 0 | — |
| 14 | Risk score: mixed severities | Weighted sum |
| 15 | Risk score: clamps at 100 | — |
| 16 | mapPollResults: aggregates threat rows | 3 rows from 2 cycles |
| 17 | mapPollResults: groups duplicates | Occurrences = 2 |
| 18 | mapPollResults: status override | CLEARED > DETECTED |
| 19 | mapPollResults: empty / null results | `[]` |
| 20 | mapPollResults: missing definitions | `[]` |

#### B. `normalization.test.js` (≈ 20 cases)

| # | Test | Expected |
|---|---|---|
| 1 | BSSID lowercase colon → uppercase | `"AA:BB:CC:DD:EE:FF"` |
| 2 | BSSID dash-separated → colon | Same |
| 3 | BSSID no-separator → colon | Same |
| 4 | BSSID null / empty → null | — |
| 5 | Valid payload normalizes correctly | All fields present |
| 6 | Trims SSID whitespace | `"My WiFi"` |
| 7 | Default timestamp when missing | Valid ISO string |
| 8 | Empty payload → safe defaults | No crash |
| 9 | XSS strings sanitized | `<` → `&lt;` |
| 10 | Validates: valid payload passes | `{ valid: true }` |
| 11 | Rejects missing SSID | Error array includes SSID |
| 12 | Rejects missing BSSID | Error array includes BSSID |
| 13 | Rejects missing channel | Error array includes channel |
| 14 | Rejects empty payload | ≥ 3 errors |
| 15 | Rejects invalid BSSID hex | Error about MAC address |
| 16 | Rejects negative channel | Non-negative error |
| 17 | Accepts channel 0 | `{ valid: true }` |
| 18 | sanitizeString: HTML entities | `<script>` escaped |
| 19 | sanitizeString: null → null | — |
| 20 | sanitizeString: trims whitespace | — |

#### C. `sorting.test.js` (≈ 16 cases)

| # | Test | Expected |
|---|---|---|
| 1 | Sort severity desc | Critical → … → None |
| 2 | Sort severity asc | None → … → Critical |
| 3 | Does not mutate input | Original unchanged |
| 4 | Sort score desc | 9.1 first |
| 5 | Sort score asc | 0.0 first |
| 6 | Sort date desc | Newest first |
| 7 | Sort date asc | Oldest first |
| 8 | Filter: single severity | Only "High" rows |
| 9 | Filter: multiple severities | High + Critical |
| 10 | Filter: case-insensitive | `"high"` matches `"High"` |
| 11 | Filter: empty → returns all | — |
| 12 | Filter: date range (start + end) | 2 items |
| 13 | Filter: start-only | Items after cutoff |
| 14 | Filter: end-only | Items before cutoff |
| 15 | Filter: category single | 2 encryption items |
| 16 | Filter: category multiple | 4 items |

#### D. `exportFormatters.test.js` (≈ 14 cases)

| # | Test | Expected |
|---|---|---|
| 1 | escapeCSVField: plain string | Pass-through |
| 2 | escapeCSVField: commas | Quoted |
| 3 | escapeCSVField: double quotes | Doubled + quoted |
| 4 | escapeCSVField: newlines | Quoted |
| 5 | escapeCSVField: null / undefined | Empty string |
| 6 | formatCSV: headers correct | First line matches |
| 7 | formatCSV: row count matches full dataset | header + 6 |
| 8 | formatCSV: row count matches filtered dataset | header + N |
| 9 | formatCSV: empty rows → header only | — |
| 10 | formatCSV: special chars round-trip | Parse back correctly |
| 11 | formatCSV: Unicode characters | Preserved |
| 12 | formatXLSXRows: header row | First element = headers |
| 13 | formatXLSXRows: row count | 1 + data length |
| 14 | formatXLSXRows: missing fields → empty string | — |

#### E. `scanValidation.test.js` (17 cases)

**validateScan(scan, networkId, maxAgeSeconds, nowMs)**

| # | Test | Expected |
|---|---|---|
| 1 | `scan` is null | `SCAN_REQUIRED` |
| 2 | `scan` is undefined | `SCAN_REQUIRED` |
| 3 | `scan.network_id` differs from request | `SCAN_NETWORK_MISMATCH` |
| 4 | Numeric `network_id` coerced to string | `valid: true` |
| 5 | Scan exceeds max age (10 min old, limit 5) | `SCAN_TOO_OLD`, extras include `scan_age_seconds` + `max_age_seconds` |
| 6 | Scan exactly at age boundary (300s = 300s) | `valid: true` (not >)
| 7 | Scan 1 second past limit (301s) | `SCAN_TOO_OLD` |
| 8 | Fresh scan, correct network (1 min old) | `valid: true` |
| 9 | Scan created 0 seconds ago | `valid: true` |
| 10 | Custom max age (60s) — 2 min old scan | `SCAN_TOO_OLD` |
| 11 | Default `nowMs` (uses `Date.now()`) | `valid: true` for fresh scan |

**buildPortalPatchPayload(bssid, ssid, nowUnix)**

| # | Test | Expected |
|---|---|---|
| 12 | `network_id` format | `"BSSID | SSID"` |
| 13 | Announcements text | Contains "Welcome" |
| 14 | Terms version format | `YYYY-MM-DD` |
| 15 | Tips array | 3 items |
| 16 | Security defaults | `score: 0`, `risk_level: "NOT YET ASSESSED"` |
| 17 | Default `nowUnix` (uses `Date.now`) | `updated_at` within 60s of now |

### 5.2 Integration Test Cases

#### Auth & Session Flow (`auth.test.js`) — 7 tests

| # | Test | Method | Expected |
|---|---|---|---|
| 1 | Valid login | `POST /api/auth/login` | 200, token in body |
| 2 | Invalid credentials | `POST /api/auth/login` | 401, error message |
| 3 | Missing email/password | `POST /api/auth/login` | 400 |
| 4 | Set refresh cookie | `POST /api/auth/set-refresh` | 200, `Set-Cookie` with HttpOnly |
| 5 | Refresh with cookie (agent) | `POST /api/auth/refresh` | 200, new access_token |
| 6 | Refresh without cookie | `POST /api/auth/refresh` | 401 |
| 7 | Logout clears cookie | `POST /api/auth/logout` | 200, cookie expired |

#### Scan Ingestion (`scanIngestion.test.js`) — 6 tests

| # | Test | Method | Expected |
|---|---|---|---|
| 1 | Valid scan payload | `POST /api/rasPi/networks` | 201, network_id returned |
| 2 | Missing fields | `POST /api/rasPi/networks` | 400 |
| 3 | Empty body | `POST /api/rasPi/networks` | 400 |
| 4 | Trigger scan → FastAPI | `POST /api/rasPi/scan` | 200, proxied |
| 5 | Trigger scan missing fields | `POST /api/rasPi/scan` | 400 |
| 6 | FastAPI unreachable | `POST /api/rasPi/scan` | 502 |

#### Authorization (`authorization.test.js`) — 8 tests

| # | Test | Expected |
|---|---|---|
| 1 | Non-admin → admin endpoint | 403 |
| 2 | Superadmin → admin endpoint | 200 |
| 3 | Admin (non-superadmin) → admin endpoint | 403 |
| 4 | Missing Authorization header | 401 |
| 5 | Malformed token | 401 |
| 6 | Expired token | 401 |
| 7 | Active user → active-only route | 200 |
| 8 | On-hold user → active-only route | 403 |

#### Device Management (`deviceMgmt.test.js`) — 16 tests

**GET /api/device/ap-state/:networkId** (3 tests)

| # | Test | Expected |
|---|---|---|
| 1 | Returns `ap_enabled` and `portal_initialized` from DB | 200, both fields |
| 2 | Defaults to `false` when columns are null | 200, `false`/`false` |
| 3 | DB query fails | 500, "Failed to fetch AP state" |

**POST /api/device/enable-ap — validation** (3 tests)

| # | Test | Expected |
|---|---|---|
| 4 | Missing `network_id` | 400, "Missing or invalid" |
| 5 | Invalid `ap_status` (e.g. `"toggle"`) | 400, "Missing or invalid" |
| 6 | Enable without `scan_id` | 400, `SCAN_REQUIRED` |

**POST /api/device/enable-ap — enable path** (4 tests)

| # | Test | Expected |
|---|---|---|
| 7 | Scan not found in DB | 400, `SCAN_REQUIRED` |
| 8 | Scan belongs to different network | 400, `SCAN_NETWORK_MISMATCH` |
| 9 | Scan exceeds max age | 400, `SCAN_TOO_OLD` + `scan_age_seconds` + `max_age_seconds` |
| 10 | First enable → portal/patch **then** orchestrate/apply | 200, 2 fetch calls in order, DB config used |
| 11 | Second enable (portal initialized) → skips portal/patch | 200, 1 fetch call |
| 12 | Enable includes `ap_password` in orchestrate/apply | Password in payload |
| 13 | `orchestrate/apply` returns error | 500, "AP toggle failed" |

**POST /api/device/enable-ap — disable path** (3 tests)

| # | Test | Expected |
|---|---|---|
| 14 | Disable works without `scan_id` | 200, `ap_status: "disable"` |
| 15 | Disable does not include `ap_password` | `ap_password` absent from payload |
| 16 | Network not found in DB on disable | 500 |

### 5.3 E2E Test Cases

#### Device Management (`device-management.spec.js`) — 4 tests

| # | Test | Prerequisites | Asserts |
|---|---|---|---|
| 1 | AP toggle disabled without scan context | Logged in, no scan run | Toggle disabled or "No network selected" guard visible |
| 2 | After SAM scan, toggle is enabled | Logged in, scan completed | Toggle visible, SSID label visible |
| 3 | AP Info panel shows network config | Logged in, network exists | SSID, BSSID, Channel, Encryption labels present |
| 4 | "Go to Scan" navigates to SAM | Logged in, no scan context | URL contains `/security-assessment` after click |

---

## 6. Fixtures & Helpers

### 6.1 Fixtures

| File | Contents |
|---|---|
| `fixtures/scanPayloads.js` | `validScanPayload`, `missingSSID`, `missingBSSID`, `missingChannel`, `emptyPayload`, `xssPayload`, `bssidVariants`, `triggerScanPayload` |
| `fixtures/threatDefinitions.js` | `threatDefinitions` (7 entries), `buildDefinitionsMap()`, `samplePollResults` (2 detection cycles), `sampleVulnerabilityRows` (6 rows) |
| `fixtures/deviceMgmtPayloads.js` | `networkRow`, `networkRowInitialized`, `networkRowEnabled`, `freshScan(createdAt)`, `mismatchedScan(createdAt)`, `oldScan()`, `enableBody`, `enableBodyNoScan`, `disableBody`, `fastapiSuccess`, `portalPatchSuccess` |

### 6.2 Helpers

| File | Purpose |
|---|---|
| `helpers/testApp.js` | Creates a minimal Express app with real middleware + routes, without calling `app.listen()`. Mounts auth, rasPi, device, SAM routes plus synthetic `/api/protected` and `/api/admin/users` endpoints for testing. |
| `helpers/mockSupabase.js` | Factory function `createMockSupabase()` returning a chainable Supabase client mock supporting `.from().select().eq().single()` etc. |

### 6.3 E2E Helpers

| File | Purpose |
|---|---|
| `e2e/helpers/auth.js` | `login(page, email, password)` — fills the login form and waits for redirect to `/dashboard`. Used by all E2E tests as a setup step. |

---

## 7. Extracted Utility Modules

These modules were extracted from inline `server.js` logic into testable, reusable units under `backend/utils/`.

| Module | Functions | Origin |
|---|---|---|
| `scoring.js` | `computeSeverityFromScore(score)`, `computeRiskScore(findings)`, `mapPollResultsToThreatRows(results, defs)` | `server.js` inline, new |
| `normalization.js` | `normalizeScanPayload(payload)`, `normalizeBSSID(bssid)`, `validateScanPayload(payload)`, `sanitizeString(value)` | `rasPiController.js` patterns, new |
| `sorting.js` | `sortBySeverity()`, `sortByScore()`, `sortByDate()`, `filterBySeverity()`, `filterByDateRange()`, `filterByCategory()` | `useSeverityTableControls.js` logic, new |
| `exportFormatters.js` | `escapeCSVField()`, `formatCSV()`, `parseCSV()`, `formatXLSXRows()` | New utility |
| `scanValidation.js` | `validateScan(scan, networkId, maxAgeSeconds, nowMs)`, `buildPortalPatchPayload(bssid, ssid, nowUnix)` | Extracted from `deviceMgmtRoutes.js` inline logic |

**Adoption path:** Import these modules into your controllers / routes to replace inline logic. For example:

```js
// In server.js — replace inline mapPollResultsToThreatRows with:
const { mapPollResultsToThreatRows } = require("./utils/scoring");

// In deviceMgmtRoutes.js — already adopted:
const { validateScan, buildPortalPatchPayload } = require("../utils/scanValidation");
```

---

## 8. Running the Tests

### Prerequisites

```bash
cd backend
npm install --save-dev jest supertest
```

### Commands

| Command | Description |
|---|---|
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:coverage` | Run with Istanbul coverage report |
| `npm run test:watch` | Watch mode (re-run on file changes) |

### Quick Start

```bash
cd backend
npm install --save-dev jest supertest
npm test
```

Expected output:

```
PASS  __tests__/unit/scoring.test.js
PASS  __tests__/unit/normalization.test.js
PASS  __tests__/unit/sorting.test.js
PASS  __tests__/unit/exportFormatters.test.js
PASS  __tests__/unit/scanValidation.test.js
PASS  __tests__/integration/auth.test.js
PASS  __tests__/integration/scanIngestion.test.js
PASS  __tests__/integration/authorization.test.js
PASS  __tests__/integration/deviceMgmt.test.js

Test Suites: 9 passed, 9 total
Tests:       175 passed, 175 total
Time:        ~2 s
```

### Running E2E Tests (Playwright)

Playwright E2E tests live in the repo root `e2e/` directory. They require both the backend and frontend to be running (Playwright can auto-start them via `playwright.config.js`).

```bash
# From repo root
npm run test:e2e              # headless
npm run test:e2e:headed       # visible browser
npm run test:e2e:ui           # interactive UI mode
```

Set test credentials via environment variables:

```bash
E2E_EMAIL=test@example.com E2E_PASSWORD=password123 npm run test:e2e
```

| Command | Description |
|---|---|
| `npm run test:e2e` | Run all E2E tests (headless Chromium) |
| `npm run test:e2e:headed` | Run with visible browser window |
| `npm run test:e2e:ui` | Playwright interactive UI mode |

---

## 9. Coverage & Thresholds

Coverage is configured in `jest.config.js`:

```js
coverageThreshold: {
  "./utils/": {
    branches: 85,
    functions: 100,
    lines: 95,
    statements: 95,
  },
  "./middleware/": {
    branches: 75,
    functions: 100,
    lines: 90,
    statements: 90,
  },
},
```

> **Note.** Per-path thresholds enforce strict coverage on the extracted utilities and security middleware — the modules where defects carry the highest risk. Global thresholds are omitted because untested controllers (e.g., `samController.js`) would artificially fail the gate. As controller-level tests are added, global thresholds should be reinstated.

Generate a coverage report:

```bash
npm run test:coverage
```

Output is written to `backend/coverage/`. Open `coverage/lcov-report/index.html` in a browser for the interactive HTML report.

### Covered Modules

| Path | Description |
|---|---|
| `utils/**/*.js` | Scoring, normalization, sorting, export, scan validation |
| `controllers/**/*.js` | Auth, rasPi, SAM, device, user, metadata |
| `middleware/**/*.js` | JWT auth, profile status |
| `services/**/*.js` | Auth service |
| `validators/**/*.js` | Auth, rasPi validators |
| `routes/**/*.js` | Auth, rasPi, device mgmt, SAM, user, webapp |

---

## 10. Mocking Strategy

### 10.1 `global.fetch`

The auth controller and rasPi controller call external APIs (Supabase REST, FastAPI) via `global.fetch`. Tests mock `global.fetch` with `jest.fn()` to return controlled responses.

```js
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ access_token: "mock" }),
});
```

### 10.2 `jose` (JWT Verification)

The `authMiddleware.js` uses `jose.jwtVerify` to validate tokens against Supabase JWKS. Tests mock the entire `jose` module:

```js
jest.mock("jose", () => ({
  createRemoteJWKSet: jest.fn(() => "mock-jwks"),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: "user-123", role: "authenticated", aud: "authenticated" },
  }),
}));
```

Per-test overrides allow simulating different user roles or token errors.

### 10.3 `supabaseClient`

The Supabase client is mocked at the module level to return chainable query builders:

```js
jest.mock("../../config/supabaseClient", () => ({
  supabaseClient: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { status: "active" }, error: null }),
    })),
  },
}));
```

### 10.4 Device Management Mocking Pattern

The `deviceMgmt.test.js` integration tests use a per-test Supabase mock builder that returns different results per table name. This allows testing the multi-table flow (scans → networks → update) in a single test:

```js
function setupSupabase(tableMap) {
  mockFrom.mockImplementation((table) => {
    if (tableMap[table]) return tableMap[table];
    return chain();
  });
}

// Usage:
setupSupabase({
  scans: chain({ singleResult: { data: freshScan(), error: null } }),
  networks: chain({ singleResult: { data: networkRow, error: null } }),
});
```

`global.fetch` is mocked per-test to intercept FastAPI calls (orchestrate/apply, portal/patch). The `fetchCalls` array tracks call order to verify portal/patch is called before orchestrate/apply.

---

### GitHub Actions Example

```yaml
name: Backend Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run test:coverage
      - name: Check coverage thresholds
        run: npx jest --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}'
```

### Fail-Fast Rules

- PRs that **decrease coverage** below the configured threshold are blocked.
- All tests must pass before merge.

---

## 12. Extending the Suite

### Adding a New Unit Test

1. Create a fixture in `__tests__/fixtures/` if needed.
2. Add a new `.test.js` file under `__tests__/unit/`.
3. Import the function under test and write `describe` / `test` blocks.
4. Run `npm test` to verify.

### Adding a New Integration Test

1. If the route isn't mounted in `testApp.js`, add it.
2. Mock any new external dependencies at the module level.
3. Add a new `.test.js` file under `__tests__/integration/`.
4. Use `supertest(app)` or `supertest.agent(app)` for cookie-persistent flows.

### Adding a New Utility Module

1. Create the module under `backend/utils/`.
2. Keep functions **pure** (no I/O, no side effects).
3. Add it to `collectCoverageFrom` in `jest.config.js`.
4. Write corresponding unit tests.

---

## 13. Known Limitations & Future Work

| Area | Current State | Next Step |
|---|---|---|
| **DB testing** | Mocked at module level (Option 1) | Option 2: Supabase local emulator or test schema for full DB integration |
| **Frontend unit tests** | Sorting / filtering logic extracted to backend `utils/`; no React component tests yet | Add `@testing-library/react` tests for AccessPointPanel, useDevice, useSAM |
| **E2E coverage** | 4 golden-path tests (AP panel flows) | Expand: scan-too-old banner, mismatch banner, portal content editing, history page |
| **E2E auth** | Uses real Supabase login | Consider mocking auth for faster, isolated E2E runs |
| **Export to real XLSX** | `formatXLSXRows` generates arrays; no actual `.xlsx` file output | Integrate with SheetJS (`xlsx` npm) and add file-output tests |
| **Refresh token rotation** | Tested basic flow | Add edge cases: expired refresh, concurrent refresh, race condition |
| **Rate limiting / brute force** | Not tested | Add tests when rate-limiting middleware is implemented |
| **Device management edge cases** | Core AP toggle + scan gating covered | Add: portal/patch content customization, concurrent enable, network row missing on enable |
| **Captive portal routes** | Commented out in codebase | Uncomment and add tests when activated |

---

*This document is maintained alongside the test suite. Update it when adding or modifying tests.*
