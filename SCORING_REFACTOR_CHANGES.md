# Scoring & Threat Persistence Refactor — Change Log

## Summary

Controlled 4-phase refactor of the detection pipeline's risk scoring, threat persistence, and stop/fail finalization logic. All changes enforce the principle that `scans.risk_score` is set **exclusively** by the Supabase RPC `compute_scan_risk` — never by JavaScript.

---

## Phase 1 — Remove JS `risk_score` Writes, Wire RPC

**Files changed:**
- `backend/controllers/detectController.js` → `persistThreatRows()`
- `backend/server.js` → `persistThreatRows()`

**What was removed:**
- `require("../utils/scoring").computeRiskScore()` calls
- Manual `.update({ risk_score: riskScore })` on the `scans` table

**What was added:**
- `supabaseClient.rpc("compute_scan_risk", { p_scan_id: scanId })` — delegates scoring to the DB RPC

**Why:**
The JS `computeRiskScore()` used a simplistic weighted sum that diverged from the authoritative DB formula. The RPC correctly counts only `vt_status = 'ACTIVE'` threats.

---

## Phase 2 — Use `detection_state.active_scan_id` for Persistence

**Files changed:**
- `backend/controllers/detectController.js` → `persistThreatRows()`, `poll()`, deleted `findLatestScanIdForBssid()`
- `backend/server.js` → `persistThreatRows()`, deleted `findLatestScanIdForBssid()`

**What was removed:**
- `findLatestScanIdForBssid()` — fragile BSSID → network → scan lookup (both files)
- BSSID-based `targetBssid` derivation in `poll()`
- Blind `INSERT` into `vulnerabilities_threat` (caused duplicate rows)

**What was added:**
- `persistThreatRows(threatRows, scanId, activeNetworkId)` — new signature accepting IDs from `detection_state` directly
- **Event history**: each poll inserts a row into `vulnerability_threat_events` with `event_state: DETECTED|CLEARED`
- **Upsert logic** for `vulnerabilities_threat` keyed on `(scan_id, vt_detail_id)`:
  - DETECTED → `vt_status='ACTIVE'`, increment `occurrence_count`, set `first_seen_at` if null
  - CLEARED → `vt_status='INACTIVE'`, set `last_seen_at`
- `poll()` now passes `stateRow.active_scan_id` and `stateRow.active_network_id` directly
- Risk pipeline call uses `activeNetworkId` directly (no BSSID lookup)

**Why:**
`findLatestScanIdForBssid` was racy and could match the wrong scan. `detection_state.active_scan_id` is the authoritative scan for the current session.

---

## Phase 3 — Stop / FAILED Finalization

**Files changed:**
- `backend/controllers/detectController.js` → `stopDetection()`
- `backend/services/detectStateService.js` → `getStatusAndMaybeFail()`

**What was added (manual STOP in `stopDetection()`):**
- After `detectStateService.stop()` returns:
  - `compute_scan_risk(active_scan_id)` — final RPC recompute
  - `updateNetworkRisk()` with final score + bucket (reason: `detection_stopped`)
  - `scans.update({ scan_end: now() })` — stamps end time
- All finalization is best-effort (`.catch()`) — never blocks the state transition

**What was added (heartbeat FAILED in `getStatusAndMaybeFail()`):**
- After RUNNING → FAILED transition:
  - `compute_scan_risk(active_scan_id)` — final RPC recompute
  - `updateNetworkRisk()` with final score + bucket (reason: `detection_failed`)
  - `scans.update({ scan_end: now() })` — stamps end time
- All finalization is best-effort

**What is NOT done on stop/fail:**
- `vulnerabilities_threat` rows are NOT cleared or deleted
- `active_scan_id` / `active_network_id` remain in `detection_state` for reference

---

## Phase 4 — riskPipeline Bucketization + Real Score Propagation

**Files changed:**
- `backend/utils/riskPipeline.js` → `bucketize()`
- `backend/controllers/detectController.js` → `persistThreatRows()`, `stopDetection()`
- `backend/services/detectStateService.js` → `getStatusAndMaybeFail()`
- `backend/server.js` → `persistThreatRows()`

**`bucketize()` — old vs new thresholds:**

| Score | Old bucket | New bucket (official) |
|-------|------------|----------------------|
| 0     | LOW        | LOW                  |
| 24    | LOW        | LOW                  |
| 25    | MEDIUM     | **LOW**              |
| 39    | MEDIUM     | **LOW**              |
| 40    | MEDIUM     | MEDIUM               |
| 49    | MEDIUM     | MEDIUM               |
| 50    | HIGH       | **MEDIUM**           |
| 69    | HIGH       | **MEDIUM**           |
| 70    | HIGH       | HIGH                 |
| 75    | CRITICAL   | **HIGH**             |
| 89    | CRITICAL   | **HIGH**             |
| 90    | CRITICAL   | CRITICAL             |
| 100   | CRITICAL   | CRITICAL             |

**What was replaced:**
- `onThreatEvent(networkId, threatRows)` calls → `updateNetworkRisk(networkId, { newBucket, newScore, reason, scanId })` using the real RPC score
- This applies in all 3 code paths: `persistThreatRows`, `stopDetection`, `getStatusAndMaybeFail`

**Why:**
- Old `bucketize()` used `<25/<50/<75` thresholds that didn't match the official scale
- Old `onThreatEvent` always passed `newScore: 0` (bucket-only), so `networks.risk_score` was never updated
- Now `networks.risk_score` and `networks.risk_bucket` both reflect the real RPC output

---

## Documentation Created

- `docs/scoring-refactor/README.md` — Full refactor documentation including:
  - Overview and motivation
  - Old vs New behavior tables
  - Session lifecycle diagram (text)
  - Data model roles (scans, vulnerabilities_threat, vulnerability_threat_events, detection_state, networks)
  - Scoring source-of-truth statement
  - Bucketization table
  - Stop/Failed behavior
  - Testing checklist

---

## Verification Checklist

- [x] `grep "computeRiskScore" backend/controllers/ backend/server.js` → zero production usage
- [x] `grep "update.*risk_score" backend/` → zero direct `scans.risk_score` writes
- [x] `grep "findLatestScanIdForBssid" backend/` → zero matches
- [x] `bucketize(0)=LOW, bucketize(39)=LOW, bucketize(40)=MEDIUM, bucketize(69)=MEDIUM, bucketize(70)=HIGH, bucketize(89)=HIGH, bucketize(90)=CRITICAL, bucketize(100)=CRITICAL`
- [x] All 4 files lint-clean (zero errors)
- [x] `onThreatEvent` removed from detect persistence/stop/fail paths (replaced by `updateNetworkRisk`)
