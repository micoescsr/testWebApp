# Unit Testing Documentation

> **Complete catalog of all unit test cases in the codebase.**
> Each section maps to a test file under `backend/__tests__/unit/`. Test cases are grouped by the `describe` block (module under test) and listed with their purpose and interpretation.

---

## Table of Contents

| # | Test File | Module Under Test | Tests |
|---|-----------|-------------------|:-----:|
| 1 | [apJobStore.test.js](#1-apjobstoretestjs) | AP Job Store (in-memory job tracker) | 14 |
| 2 | [exportFormatters.test.js](#2-exportformatterstestjs) | CSV/XLSX Export Formatting | 18 |
| 3 | [normalization.test.js](#3-normalizationtestjs) | Payload Normalization & Validation | 26 |
| 4 | [portalTipResolver.test.js](#4-portaltiptresolvertestjs) | Captive Portal Tip Resolution & Hashing | 8 |
| 5 | [riskPipeline.portalTipset.test.js](#5-riskpipelineportaltipsettestjs) | Risk Pipeline — Portal Auto-Patching | 2 |
| 6 | [scanValidation.test.js](#6-scanvalidationtestjs) | Scan Validation & Portal Payload Builder | 18 |
| 7 | [scoring.test.js](#7-scoringtestjs) | Scoring & Severity Functions | 28 |
| 8 | [signing.test.js](#8-signingtestjs) | HMAC Request Signing (Pi Integration) | 8 |
| 9 | [sorting.test.js](#9-sortingtestjs) | Sort & Filter Utilities | 22 |
| 10 | [threatMerge.test.js](#10-threatmergetestjs) | Threat Session Merge Logic (Frontend) | 7 |
| 11 | [threatPersistence.test.js](#11-threatpersistencetestjs) | Threat Persistence & History Filters | 7 |
| | | **Total** | **158** |

---

## 1. apJobStore.test.js

**File:** `backend/__tests__/unit/apJobStore.test.js`
**Source Module:** `backend/services/apJobStore.js`

**Purpose:** Tests the in-memory job store that tracks AP (Access Point) enable/disable orchestration jobs. Each job goes through a lifecycle: `ACCEPTED → ONGOING → DONE/FAILED`, with cleanup of stale entries.

### Manuscript Interpretation

The AP Job Store is a lightweight, in-memory state machine that tracks asynchronous AP orchestration tasks. Since AP enable/disable operations are long-running (involving communication with physical devices), the system needs a way to track their lifecycle without persisting to a database. These tests validate the full CRUD lifecycle and demonstrate the store's resilience to edge cases (missing jobs, concurrent cleanup).

### Test Cases

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `create() stores and returns a job with defaults` | When a new job is created, it is stored with default fields: status `ACCEPTED`, `finalized: false`, `result: null`, `error_code: null`, `error_message: null`, and auto-generated timestamps (`created_at`, `updated_at`). |
| 2 | `get() returns the correct job` | Retrieves a previously created job by its `job_id`. Confirms basic read-by-ID. |
| 3 | `get() returns null for missing job` | Returns `null` instead of throwing when a non-existent job ID is queried. Prevents runtime errors. |
| 4 | `getActiveForNetwork() returns non-terminal job` | Queries active (non-completed) jobs for a given network. Ensures the system can detect if an AP operation is already in progress for a network. |
| 5 | `getActiveForNetwork() ignores terminal jobs` | Once a job reaches `DONE` status, it is no longer considered "active" for idempotency checks. |
| 6 | `getActiveForNetwork() ignores FAILED jobs` | `FAILED` jobs are also terminal — they should not block new operations on the same network. |
| 7 | `update() merges fields and bumps updated_at` | Partial updates merge into the existing job object and the `updated_at` timestamp refreshes — important for staleness detection. |
| 8 | `update() returns null for missing job` | Updating a non-existent job returns `null` gracefully instead of crashing. |
| 9 | `markFinalized() sets finalized flag` | The `finalized` flag indicates the result has been delivered to the caller. Prevents duplicate delivery of results. |
| 10 | `markFinalized() is safe for missing job` | Calling `markFinalized` on a non-existent job does not throw — safe for races. |
| 11 | `cleanup() removes stale terminal jobs past TTL` | Terminal jobs (`DONE`/`FAILED`) older than the TTL (10 minutes) are garbage-collected from memory to prevent unbounded growth. |
| 12 | `cleanup() keeps active (non-terminal) jobs` | In-progress jobs are never removed, regardless of age. |
| 13 | `cleanup() keeps recent terminal jobs` | Recently-completed jobs survive cleanup so their results can still be polled. |
| 14 | `_reset() clears all jobs` | Test utility — wipes the store between test runs to ensure isolation. |

---

## 2. exportFormatters.test.js

**File:** `backend/__tests__/unit/exportFormatters.test.js`
**Source Module:** `backend/utils/exportFormatters.js`

**Purpose:** Tests CSV and XLSX export formatting — field escaping, full CSV generation, round-trip parsing, and XLSX row construction. Ensures exported data is safe, well-formed, and faithfully represents vulnerability scan results.

### Manuscript Interpretation

The export subsystem allows users to download scan results as CSV or XLSX files. This is a critical data-integrity boundary: if special characters (commas, quotes, newlines, XSS payloads, Unicode) corrupt the output, the exported file becomes unusable or potentially dangerous. These tests verify that every cell is properly escaped, that round-trip CSV generation and parsing preserves data exactly, and that the XLSX row builder produces correct tabular structures.

### Test Cases

#### A. `escapeCSVField` — Individual field escaping

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `plain string passes through` | Strings without special characters are returned as-is (no unnecessary wrapping). |
| 2 | `wraps and escapes commas` | Fields containing commas get double-quoted to prevent column splitting. |
| 3 | `wraps and escapes double quotes` | Embedded quotes are doubled (`""`) per RFC 4180 CSV standard. |
| 4 | `wraps and escapes newlines` | Newline characters within a field get quoted to prevent row splitting. |
| 5 | `handles null/undefined` | Null and undefined values produce an empty string (no `"null"` text). |
| 6 | `handles numbers` | Numeric values are converted to their string representation. |
| 7 | `handles XSS-like strings safely` | `<script>` tags are safely escaped via quoting — no injection in spreadsheet apps. |

#### B. `formatCSV` — Full CSV generation

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 8 | `headers match expected columns` | First line of output contains the specified column headers in order. |
| 9 | `row count matches dataset` | Output has exactly 1 header row + N data rows — no missing/extra rows. |
| 10 | `row count matches filtered dataset` | Filtered subsets produce the correct number of rows. |
| 11 | `empty rows produce header-only CSV` | An empty dataset still produces the header line (valid CSV). |
| 12 | `special characters don't break output (round-trip)` | CSV with embedded quotes and commas can be parsed back to identical data. Proves full fidelity. |
| 13 | `handles Unicode characters` | Non-ASCII characters (e.g., `Café WiFi ☕`) appear correctly in the output. |

#### C. `parseCSV` — Round-trip verification

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 14 | `parses generated CSV correctly` | Parsing the CSV produced by `formatCSV` recovers the original headers and row count. |
| 15 | `handles empty CSV` | An empty string produces empty headers and rows arrays (no crash). |

#### D. `formatXLSXRows` — XLSX row construction

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 16 | `first row is the header row` | The XLSX array-of-arrays starts with the header array. |
| 17 | `data rows match dataset values` | Data cells contain the actual values from each vulnerability row. |
| 18 | `missing fields default to empty string` | Fields absent from a data object become `""` rather than `undefined`. |
| 19 | `empty array returns header only` | No data rows → result is `[[headers]]` only. |

---

## 3. normalization.test.js

**File:** `backend/__tests__/unit/normalization.test.js`
**Source Module:** `backend/utils/normalization.js`

**Purpose:** Tests BSSID normalization, scan payload normalization, payload validation, and string sanitization. These are the first line of defense for incoming scan data — ensuring consistency and blocking injection.

### Manuscript Interpretation

Raw scan data arrives from Wi-Fi scanning devices in varied formats: BSSIDs may be dash-separated, colon-separated, or plain hex; SSIDs may have leading/trailing whitespace; user-supplied text fields may contain HTML/XSS payloads. Normalization converts everything into a canonical form before storage, while validation enforces structural requirements (required fields, valid MAC format, non-negative channels). This ensures that all downstream processing — threat detection, scoring, and display — operates on clean, trusted data.

### Test Cases

#### A. `normalizeBSSID` — MAC address normalization

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `normalizes lowercase colon-separated` | `aa:bb:cc:dd:ee:ff` → `AA:BB:CC:DD:EE:FF` |
| 2 | `normalizes dash-separated` | `aa-bb-cc-dd-ee-ff` → `AA:BB:CC:DD:EE:FF` |
| 3 | `normalizes no-separator` | `aabbccddeeff` → `AA:BB:CC:DD:EE:FF` |
| 4 | `preserves already-uppercase colon-separated` | Already-normalized input passes through unchanged. |
| 5 | `normalizes mixed case` | Mixed `aA:Bb:cC` → fully uppercase. |
| 6 | `returns uppercase for invalid hex (too short)` | Short hex strings are uppercased but not padded — garbage in, clean garbage out. |
| 7 | `returns null for null/undefined/empty` | Absent values produce `null`, not an empty string. |

#### B. `normalizeScanPayload` — Full payload normalization

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 8 | `normalizes a valid payload` | All fields are cleaned: SSID trimmed, BSSID uppercased, channel as integer, encryption standardized. |
| 9 | `trims SSID whitespace` | `"  My WiFi  "` → `"My WiFi"` |
| 10 | `uppercases BSSID` | BSSID is always stored in uppercase canonical format. |
| 11 | `provides default timestamp when missing` | If the scan device omits a timestamp, the server generates one. |
| 12 | `defaults empty object safely` | An empty `{}` payload doesn't crash — fields get safe defaults. |
| 13 | `sanitizes city and notes strings` | User-provided text fields have HTML entities escaped to prevent XSS (e.g., `<` → `&lt;`). |

#### C. `validateScanPayload` — Structural validation

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 14 | `valid payload passes` | A well-formed payload returns `{ valid: true, errors: [] }`. |
| 15 | `rejects missing SSID` | SSID is required; absence produces error `"SSID is required"`. |
| 16 | `rejects missing BSSID` | BSSID is required; absence produces error `"BSSID is required"`. |
| 17 | `rejects missing channel` | Channel is required; absence produces error `"Channel is required"`. |
| 18 | `rejects empty payload with multiple errors` | An empty payload accumulates multiple errors (at least 3). |
| 19 | `rejects invalid BSSID format` | Non-hex characters (`ZZZZZZ`) trigger a MAC address format error. |
| 20 | `rejects negative channel` | Channel must be non-negative (Wi-Fi channels start at 0). |
| 21 | `accepts channel 0 (valid)` | Channel 0 is a legitimate value (auto-detect). |
| 22 | `accepts various valid BSSID formats` | Colon-separated, dash-separated, and no-separator BSSIDs all pass validation. |

#### D. `sanitizeString` — HTML entity escaping

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 23 | `escapes HTML entities` | `<`, `>` characters become `&lt;`, `&gt;` to prevent XSS. |
| 24 | `escapes ampersand` | `&` → `&amp;` |
| 25 | `escapes single quotes` | `'` → `&#x27;` to prevent attribute injection. |
| 26 | `trims whitespace` | Leading/trailing whitespace is removed. |
| 27 | `returns null for null/undefined` | Absent values pass through as-is. |
| 28 | `converts numbers to string` | Numeric inputs are stringified rather than rejected. |

---

## 4. portalTipResolver.test.js

**File:** `backend/__tests__/unit/portalTipResolver.test.js`
**Source Module:** `backend/utils/portalTipResolver.js`

**Purpose:** Tests the conditional resolution of captive portal tips — the security advice shown to end users when they connect to a monitored Wi-Fi network. Tips are selected based on detected vulnerabilities, deduplicated, sorted, truncated, hashed for change detection, and resolved through a multi-tier fallback chain.

### Manuscript Interpretation

The captive portal tip system is a core differentiator of the product: it translates detected vulnerabilities (e.g., `WFVT-001` for open encryption) into actionable security tips shown to Wi-Fi users. The resolution pipeline has three tiers: (1) vulnerability-specific tips matched by detected codes, (2) baseline tips when no specific codes match, and (3) legacy/hardcoded fallback tips when the `portal_tips` DB table is unavailable. The tipset hash enables change detection — the portal is only re-patched when tips actually change, not on every scan. These tests verify each tier and the deduplication/hashing guarantees.

### Test Cases

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `isOpenEncryption matches common open values` | The function recognizes `"Open"`, `"none"`, and `"UNENCRYPTED"` but not `"wpa2"`. Used to auto-derive the `WFVT-001` (open network) code. |
| 2 | `finalizePortalTips dedupes (case-insensitive), sorts, caps, and truncates` | Duplicate tips (by case-insensitive text) are merged, blank tips are discarded, long texts are truncated to `MAX_PORTAL_TIP_TEXT_CHARS`, results are sorted by `sort_order`, and capped at `MAX_PORTAL_TIPS`. |
| 3 | `computePortalTipsetHash is deterministic and order-insensitive` | Two tip arrays with the same text (ignoring order, case, and duplicates) produce the same SHA-256 hash. Different tip text produces a different hash. This is the change-detection mechanism. |
| 4 | `getDetectedPortalCodesForNetwork derives WFVT-001 and merges scan + threat codes` | Combines three code sources: auto-derived from encryption status, vulnerability scan findings, and active threats. Deduplicates and returns the union. |
| 5 | `resolveConditionalPortalTips returns specific tips when codes match` | When detected vulnerability codes have matching entries in the `portal_tips` DB table, those specific tips are returned (not baseline). |
| 6 | `resolveConditionalPortalTips falls back to baseline when no specifics match` | When no vulnerability codes match any tips, the system returns baseline (generic) tips instead of nothing. |
| 7 | `resolveFinalPortalTipsForNetwork falls back to legacy tips when portal_tips unavailable` | If the `portal_tips` DB table doesn't exist (new schema not yet deployed), the system falls back to the `captive_portal_tips` legacy table. |
| 8 | `resolveFinalPortalTipsForNetwork falls back to hardcoded defaults when no DB tips exist` | If neither DB table has tips, hardcoded default tips are returned as a final safety net. |

---

## 5. riskPipeline.portalTipset.test.js

**File:** `backend/__tests__/unit/riskPipeline.portalTipset.test.js`
**Source Module:** `backend/utils/riskPipeline.js`

**Purpose:** Tests the automatic portal re-patching logic within the risk pipeline. When a network's risk is recalculated, the system also checks if the portal tipset has changed and patches the physical Pi device accordingly.

### Manuscript Interpretation

The risk pipeline is triggered after every scan completion. Beyond updating the risk score, it also checks whether the set of displayed portal tips has changed (using tipset hashes). This decouples tip changes from risk changes — a tipset change alone (e.g., a new vulnerability tip added by an admin) can trigger a portal patch even if the risk score didn't change. Conversely, a risk change without a tipset change sends a lighter risk-only patch. These two tests validate both scenarios, ensuring the Pi device is always kept in sync.

### Test Cases

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `auto-patches portal when tipset changes even if risk did not` | The risk score stayed `LOW`, but the tipset hash changed (`old-hash` → `desired-hash`). Confirms a full portal patch (including tip content) is sent to the Pi via `piFetch('/portal/patch')`, and the network's `portal_tipset_hash` is updated in the DB. `result.changed` is `false` (risk unchanged), but `result.portalPatched` is `true`. |
| 2 | `risk change triggers risk-only patch when tipset did not change` | The risk bucket changed (`LOW` → `HIGH`), but tips stayed the same (`same-hash`). Confirms a risk-only patch is sent (`jsonBody.risk` is present, `jsonBody.patch` is `undefined`). The network's `portal_last_patched_version` is updated, but `portal_tipset_hash` is not. |

---

## 6. scanValidation.test.js

**File:** `backend/__tests__/unit/scanValidation.test.js`
**Source Module:** `backend/utils/scanValidation.js`

**Purpose:** Tests scan validation rules (existence, ownership, freshness) and the portal patch payload builder. These functions guard AP and portal operations to ensure they act on valid, recent scan data.

### Manuscript Interpretation

Before the system enables an AP or patches a captive portal, it must verify the scan that triggered the action is (1) present, (2) owned by the correct network, and (3) recent enough to be trusted. A stale scan (older than the configurable max age) could cause the system to act on outdated threat data. The `buildPortalPatchPayload` function constructs the exact JSON payload sent to the Pi device for portal content updates.

### Test Cases

#### A. `validateScan` — Scan validation rules

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `returns SCAN_NOT_FOUND when scan is null` | A null scan fails with code `SCAN_NOT_FOUND`. |
| 2 | `returns SCAN_NOT_FOUND when scan is undefined` | Undefined scan also fails with `SCAN_NOT_FOUND`. |
| 3 | `returns SCAN_NETWORK_MISMATCH when network_id differs` | Prevents acting on a scan that belongs to a different network (authorization check). |
| 4 | `coerces numeric network_id to string for comparison` | Scan `network_id: 42` matches request `"42"` — prevents false mismatches from type differences. |
| 5 | `returns SCAN_TOO_OLD when scan exceeds max age` | A scan finished 10 minutes ago fails the 5-minute freshness check. Also returns `extras.scan_age_seconds` and `extras.max_age_seconds` for debugging. |
| 6 | `passes when scan is exactly at the age boundary` | Exactly 300s old with 300s limit passes (strict `>`, not `>=`). |
| 7 | `returns SCAN_TOO_OLD when scan is 1 second past the limit` | 301s old with 300s limit fails. Tests the boundary condition precisely. |
| 8 | `returns valid for a fresh scan on the correct network` | Happy path — 1 minute old, correct network. |
| 9 | `valid scan 0 seconds ago` | Scan finished just now is valid. |
| 10 | `respects custom max age` | A 2-minute-old scan fails when max age is set to 1 minute (custom configuration). |
| 11 | `uses Date.now() when nowMs is not provided` | If the `nowMs` parameter is omitted, the function uses the current time — supporting both test-injectable and production modes. |

#### B. `buildPortalPatchPayload` — Pi portal payload construction

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 12 | `constructs network_id as 'BSSID \| SSID'` | The `network_id` field follows the `"BSSID | SSID"` convention expected by the Pi device. |
| 13 | `includes announcements with correct text` | The payload includes an `announcements` block with a `"Welcome"` text and timestamp. |
| 14 | `includes terms with version matching date` | Terms of service section has a date-based version string (`YYYY-MM-DD` format). |
| 15 | `includes 3 tips` | Default portal has exactly 3 safety tips. |
| 16 | `security section defaults to LOW when score is 0` | A zero risk score maps to the `LOW` risk bucket. |
| 17 | `uses Date.now when nowUnix is omitted` | Timestamp defaults to current time if not explicitly passed. |

---

## 7. scoring.test.js

**File:** `backend/__tests__/unit/scoring.test.js`
**Source Module:** `backend/utils/scoring.js`

**Purpose:** Tests the security scoring engine — the functions that convert raw vulnerability scores (CVSS-style 0–10) into severity labels, aggregate them into a network risk score, and map detection poll results into structured threat rows.

### Manuscript Interpretation

The scoring module is the analytical backbone of the system. It translates raw numeric CVSS-like scores (0.0–10.0) into human-readable severity labels (`None`, `Low`, `Medium`, `High`, `Critical`) using industry-standard thresholds. It then aggregates individual findings into a composite network risk score (0–100, clamped). Finally, `mapPollResultsToThreatRows` converts raw detection cycle data into the normalized threat rows displayed on the dashboard. These tests exhaustively cover boundary conditions (e.g., 3.99 → Low vs. 4.0 → Medium) and edge cases (null, NaN, negative, out-of-range).

### Test Cases

#### A. `computeSeverityFromScore` — CVSS-to-severity mapping

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `score 0 → None` | A zero score means no vulnerability. |
| 2 | `score 0.1–3.9 → Low` | Low severity range (tested at boundaries: 0.1, 1.0, 3.9, 3.99). |
| 3 | `score 4.0–6.9 → Medium` | Medium range starts at exactly 4.0 (tested at 4.0, 4.1, 5.5, 6.9, 6.99). |
| 4 | `score 7.0–8.9 → High` | High range starts at exactly 7.0 (tested at 7.0, 7.1, 8.0, 8.9, 8.99). |
| 5 | `score 9.0–10.0 → Critical` | Critical range starts at exactly 9.0 (tested at 9.0, 9.1, 10.0). |
| 6 | `null score returns N/A` | Missing score handled gracefully. |
| 7 | `undefined score returns N/A` | Same for undefined. |
| 8 | `empty string returns N/A` | Non-numeric string input. |
| 9 | `NaN string returns N/A` | Explicitly non-numeric text. |
| 10 | `negative score returns N/A` | Below valid range (negative scores are invalid). |
| 11 | `score > 10 returns N/A` | Above valid range (CVSS max is 10.0). |
| 12 | `string-encoded number works` | `"7.5"` (string) correctly resolves to `"High"`. |

#### B. `computeRiskScore` — Aggregate network risk

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 13 | `empty findings returns 0` | No findings = zero risk. |
| 14 | `null/undefined returns 0` | Null or undefined findings array handled safely. |
| 15 | `single critical finding scores 10` | One critical finding contributes weight 10 to the total. |
| 16 | `single low finding scores 1` | One low finding contributes weight 1. |
| 17 | `mixed findings produce weighted sum` | Critical (10) + High (7) + Medium (4) + Low (1) = 22. Demonstrates the weighted aggregation formula. |
| 18 | `clamps to 100 for many findings` | 20 critical findings (20 × 10 = 200) are clamped to 100 — the maximum risk score. |
| 19 | `none-severity findings contribute 0` | Findings with score 0 don't increase risk. |
| 20 | `missing score fields don't break scoring` | Null, undefined, or absent score properties are treated as 0. |

#### C. `mapPollResultsToThreatRows` — Detection data transformation

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 21 | `maps poll results to aggregated threat rows` | Raw poll results with 3 distinct threat codes produce 3 threat rows. |
| 22 | `groups duplicate vt_code across cycles` | Evil Twin (`WFVT-006`) appears in two detection cycles — it's grouped into one row with 2 occurrences and 2 sessions. |
| 23 | `latest status overrides previous (CLEARED > DETECTED)` | When a threat is detected in cycle 1 and cleared in cycle 2, final status is `CLEARED`. |
| 24 | `includes correct severity and score from definitions` | Severity and score are looked up from the definitions map, not the raw poll data. |
| 25 | `ignores findings without matching definition` | Unknown threat codes without a definition entry are silently skipped. |
| 26 | `handles empty results array` | Empty input produces empty output. |
| 27 | `handles null/undefined results` | Null or undefined input produces empty output. |
| 28 | `detected time uses first_seen_epoch for initial detection` | The `detectedTime` field is derived from the `first_seen_epoch` timestamp in the raw findings. |

---

## 8. signing.test.js

**File:** `backend/__tests__/unit/signing.test.js`
**Source Module:** `backend/utils/signing.js`

**Purpose:** Tests the HMAC-SHA256 request signing mechanism used for authenticated communication with the Pi FastAPI device. Every outbound request to the Pi is signed with four `X-Control-*` headers.

### Manuscript Interpretation

The Pi control device authenticates incoming requests using HMAC-SHA256 signatures. The web backend must produce a canonical string from the HTTP method, path (including query string), body hash, timestamp, and nonce, then sign it with a shared secret. This prevents MITM attacks and replay attacks. These tests verify the header structure, body hashing, canonical string construction, output format, and the guard against missing secrets.

### Test Cases

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `returns all four X-Control-* headers` | Output contains `X-Control-Timestamp`, `X-Control-Nonce`, `X-Control-Body-SHA256`, and `X-Control-Signature`. |
| 2 | `computes correct body SHA256 for empty body (GET)` | GET requests have an empty body; the hash matches `SHA-256("")`. |
| 3 | `computes correct body SHA256 for JSON body (POST)` | POST body `{"network_id":"abc-123"}` produces the correct SHA-256 hash. |
| 4 | `includes query string in signature (canonical string)` | Signing `/detect/poll?max_items=50` produces a different signature than `/detect/poll` alone — query strings are part of the signed data. |
| 5 | `produces lowercase hex for both body hash and signature` | Both hashes are exactly 64 lowercase hex characters (`/^[0-9a-f]{64}$/`). |
| 6 | `uppercases the method in canonical string` | `"get"` and `"GET"` both produce valid signatures — the function normalizes the method to uppercase internally. |
| 7 | `throws if secret is missing` | An empty secret string throws `"CONTROL_SIGNING_SECRET missing"` — prevents unsigned requests from being sent. |
| 8 | `produces a verifiable HMAC signature` | The signature can be independently verified by recomputing the HMAC from the canonical string and shared secret. |

---

## 9. sorting.test.js

**File:** `backend/__tests__/unit/sorting.test.js`
**Source Module:** `backend/utils/sorting.js`

**Purpose:** Tests sort and filter utilities used to organize vulnerability/threat data on the dashboard. Covers sorting by severity, score, and date, as well as filtering by severity level, date range, and category.

### Manuscript Interpretation

The dashboard presents vulnerability and threat data in sortable, filterable tables. These utility functions are pure, stateless transformations that the frontend calls to reorder or narrow the displayed dataset. The tests ensure immutability (original array not mutated), correct ordering (ascending/descending), case-insensitive filtering, and graceful handling of edge cases (empty arrays, null filters, unknown severity levels).

### Test Cases

#### A. `sortBySeverity` — Severity-based ordering

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `desc: Critical → High → Medium → Low → None` | Descending order follows the severity hierarchy correctly. |
| 2 | `asc: None → Low → Medium → High → Critical` | Ascending order inverts the hierarchy. |
| 3 | `does not mutate original array` | Sorting returns a new array — the original data is unchanged (immutability). |
| 4 | `handles empty array` | Sorting an empty array returns an empty array (no crash). |
| 5 | `handles items with unknown severity` | Items with an unrecognized severity string are sorted to the end. |

#### B. `sortByScore` — Numeric score ordering

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 6 | `desc: highest score first` | 9.1 appears first in descending order. |
| 7 | `asc: lowest score first` | 0.0 appears first in ascending order. |
| 8 | `handles missing scores as 0` | Null/undefined scores are treated as 0 for ordering purposes. |

#### C. `sortByDate` — Temporal ordering

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 9 | `desc: newest first` | Most recent date appears first. |
| 10 | `asc: oldest first` | Oldest date appears first. |

#### D. `filterBySeverity` — Severity-level filtering

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 11 | `filters by single severity` | Selecting `["High"]` returns only the 2 High items. |
| 12 | `filters by multiple severities` | `["High", "Critical"]` returns 3 items total. |
| 13 | `case-insensitive` | `["high", "CRITICAL"]` matches regardless of case. |
| 14 | `empty filter returns all items` | An empty filter array means "no filter applied" — returns everything. |
| 15 | `null filter returns all items` | `null` also means no filter. |
| 16 | `non-matching filter returns empty` | A severity that doesn't exist in the data returns 0 items. |

#### E. `filterByDateRange` — Temporal window filtering

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 17 | `filters within date range` | Items between Feb 20–21 are returned (2 items). |
| 18 | `start-only filter` | Items from Feb 21 onward (2 items). |
| 19 | `end-only filter` | Items through Feb 19 (3 items). |
| 20 | `null range returns all items` | No date boundaries = return everything. |

#### F. `filterByCategory` — Category filtering

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 21 | `filters by single category` | Single category match works. |
| 22 | `filters by multiple categories` | Multiple categories work. |
| 23 | `case-insensitive` | `["ENCRYPTION"]` matches `"encryption"`. |
| 24 | `empty values returns all` | Empty filter array returns all items. |

---

## 10. threatMerge.test.js

**File:** `backend/__tests__/unit/threatMerge.test.js`
**Source Module:** Frontend logic from `useSAM.js` (re-implemented for unit testing)

**Purpose:** Tests the `mergeThreats` function that accumulates threat sessions across polling cycles. Instead of replacing the threat list on each poll, this function merges incoming data with previously known threats, preserving session history.

### Manuscript Interpretation

The Security Assessment Module (SAM) polls the Pi device periodically for threat detection results. Each poll may report new sessions, updated session states (DETECTED → CLEARED), or entirely new threats. The `mergeThreats` function is the core data reconciliation logic that prevents data loss between polls. It deduplicates sessions by `firstSeen` timestamp, updates existing sessions in place, appends new sessions, and recalculates occurrence counts. These tests verify the merge semantics that maintain a complete threat timeline across the session.

### Test Cases

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `returns incoming when prev is empty` | First poll — no prior state, incoming data becomes the initial truth. |
| 2 | `returns prev when incoming is empty` | Empty poll response doesn't wipe existing data. |
| 3 | `appends new threat id not in prev` | A new threat (`WFVT-007`) not in previous state is added alongside existing threats. |
| 4 | `merges sessions from same threat across polls` | Evil Twin (`WFVT-006`) has its session at `firstSeen=100` updated from `DETECTED` to `CLEARED`, and a new session at `firstSeen=200` is appended. Total: 2 sessions. |
| 5 | `occurrences count equals number of CLEARED sessions` | If both sessions are `CLEARED`, `occurrences` = 2 (counts resolved attack instances). |
| 6 | `does not duplicate sessions with same firstSeen` | Receiving a session with the same `firstSeen` as an existing one updates it in place rather than creating a duplicate. |
| 7 | `preserves prev threats even when incoming has different threats` | If poll 2 reports `WFVT-008` but not `WFVT-006`, the previously known `WFVT-006` is still retained. |

---

## 11. threatPersistence.test.js

**File:** `backend/__tests__/unit/threatPersistence.test.js`
**Source Module:** `backend/controllers/detectController.js` (logic extracted for testing)

**Purpose:** Tests three related concerns: (1) the `mapPollResultsToThreatRows` function for correct session/status mapping, (2) the DB insert payload construction for CLEARED threats (a previously-fixed bug), and (3) the `vt_kind` filter for history queries (a case-mismatch fix).

### Manuscript Interpretation

This file documents and regression-tests two specific bugs that were identified and fixed:

- **CLEARED fix:** When a threat transitioned from DETECTED to CLEARED, the original code set `first_seen_at` to `null` and `occurrence_count` to `0`. This was incorrect — a CLEARED threat was still seen at least once. The fix ensures `first_seen_at` is always populated from session data and `occurrence_count` is always ≥ 1.
- **vt_kind case fix:** The database stores `vt_kind` in uppercase (`THREAT`, `VULNERABILITY`), but the history query originally used lowercase (`"threat"`), causing zero results. The fix uses `.in("vt_kind", ["threat", "THREAT"])` to match both cases.

### Test Cases

#### A. `mapPollResultsToThreatRows` — Session accumulation

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 1 | `groups findings by vt_code and accumulates sessions` | Evil Twin appears in 2 cycles → 2 sessions, status `CLEARED` (last wins), 2 occurrences. |
| 2 | `includes threats that are only CLEARED (never DETECTED in current batch)` | A threat may only appear as `CLEARED` if it was detected earlier — it should still be included with the correct `firstSeen`/`lastSeen` times. |
| 3 | `returns empty array for empty results` | No crash on empty input. |

#### B. `persistThreatRows insert payload (CLEARED fix)` — Bug regression test

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 4 | `CLEARED threat should have first_seen_at populated (not null)` | A `CLEARED` threat's insert payload has `first_seen_at` derived from session data (epoch `1740400000` → ISO string), `occurrence_count = 1`, and `vt_status = "INACTIVE"`. This is the regression test for the fix. |
| 5 | `DETECTED threat still gets first_seen_at = now and occurrence_count = 1` | A `DETECTED` threat produces `vt_status = "ACTIVE"`, `occurrence_count = 1`, and a non-null `first_seen_at`. |

#### C. `historyController vt_kind filter (case mismatch fix)` — Bug regression test

| # | Test Case | What It Validates |
|---|-----------|-------------------|
| 6 | `threat history finds UPPERCASE vt_kind rows (DB-stored format)` | The fixed filter `["threat", "THREAT"]` matches DB rows with uppercase `vt_kind = "THREAT"`. |
| 7 | `threat history finds lowercase vt_kind rows (legacy format)` | The old query `r.vt_kind === "threat"` returns 0 results on uppercase DB data (demonstrating the bug), while the new `.in()` filter returns 1 result (demonstrating the fix). |

---

## Running the Tests

```bash
# Navigate to the backend directory
cd backend

# Run all unit tests
npx jest --testPathPattern="__tests__/unit" --verbose

# Run a specific test file
npx jest --testPathPattern="__tests__/unit/scoring.test.js" --verbose

# Run tests with coverage
npx jest --testPathPattern="__tests__/unit" --coverage
```

## Test Infrastructure

| File | Purpose |
|------|---------|
| `backend/__tests__/setup.js` | Global Jest setup (environment config) |
| `backend/__tests__/helpers/mockSupabase.js` | Supabase client mock for DB-dependent tests |
| `backend/__tests__/helpers/testApp.js` | Express app builder for integration tests |
| `backend/__tests__/fixtures/scanPayloads.js` | Sample scan data (valid, invalid variants, XSS) |
| `backend/__tests__/fixtures/threatDefinitions.js` | Threat definition maps and sample poll results |
| `backend/__tests__/fixtures/deviceMgmtPayloads.js` | Device management test payloads |
| `backend/jest.config.js` | Jest configuration |

---

*Generated from codebase analysis. 11 test files, 158 individual test cases.*
