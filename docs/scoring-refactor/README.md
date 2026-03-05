# Scoring & Threat Persistence Refactor

## Overview — Why Refactor

The existing detection pipeline has two critical problems:

1. **Risk score computed in JS, not the DB RPC.**  
   `computeRiskScore()` in `utils/scoring.js` calculates a JS-side risk score then writes it
   directly to `scans.risk_score`. This diverges from the authoritative Supabase RPC
   `public.compute_scan_risk(p_scan_id)` which correctly counts only ACTIVE threats and
   uses the canonical scoring formula.

2. **Scan ID derived by BSSID lookup instead of `detection_state`.**  
   `findLatestScanIdForBssid()` queries `networks` + `scans` to guess the scan. This is
   fragile (races, wrong network matched) and ignores the authoritative
   `detection_state.active_scan_id` that was set when detection started.

This refactor eliminates both anti-patterns and adds proper stop/fail finalization.

---

## Old Behavior vs New Behavior

### Threat persistence

| Aspect | Old | New |
|---|---|---|
| Scan ID source | `findLatestScanIdForBssid(bssid)` | `detection_state.active_scan_id` (passed explicitly) |
| Insert target | Raw `INSERT` into `vulnerabilities_threat` (dup rows) | **Upsert** `vulnerabilities_threat` by `(scan_id, vt_detail_id)` + insert event history into `vulnerability_threat_events` |
| DETECTED handling | Insert row with `vt_status` from raw finding | Set `vt_status='ACTIVE'`, increment `occurrence_count`, set `first_seen_at` if null |
| CLEARED handling | Insert separate row | Set `vt_status='INACTIVE'`, stamp `last_seen_at` |

### Risk scoring

| Aspect | Old | New |
|---|---|---|
| Score computation | JS `computeRiskScore()` → manual `.update({ risk_score })` | Supabase RPC `compute_scan_risk(p_scan_id)` (DB-side) |
| Network risk update | `onThreatEvent()` with `newScore: 0` (bucket-only) | `updateNetworkRisk()` with real RPC score + correct bucket |
| Bucketization | `<25 LOW / <50 MED / <75 HIGH / else CRIT` | `0-39 LOW / 40-69 MED / 70-89 HIGH / 90-100 CRIT` |

### Stop / Fail

| Aspect | Old | New |
|---|---|---|
| Manual STOP | State transitions only | + Final `compute_scan_risk` + set `scans.scan_end` |
| Heartbeat FAILED | State transitions only | + Final `compute_scan_risk` + set `scans.scan_end` (best-effort) |
| Active threats on stop | N/A (not addressed) | **NOT cleared** — threat rows remain as-is |

---

## Session Lifecycle (text diagram)

```
User clicks "Scan"
       │
       ▼
 ┌──────────────────────────────┐
 │  rasPiController              │
 │  saveNetworkMetadataScan()    │
 │  ● insert network + scan row  │
 │  ● insert vuln findings       │
 │  ● RPC compute_scan_risk      │  ◄── vulnerability snapshot scored
 │  ● auto-start detection       │
 │    (startOrSwitch with         │
 │     scan_id from public.scans) │
 └──────────────┬───────────────┘
                │
                ▼
 ┌──────────────────────────────┐
 │  detection_state              │
 │  status=RUNNING               │
 │  active_scan_id = 42          │
 │  active_network_id = <uuid>   │
 └──────────────┬───────────────┘
                │
     ┌──────────┴──────────┐
     │  Frontend polls      │
     │  GET /api/detect/poll│
     ▼                      │
 ┌──────────────────────┐   │  (repeats every N sec)
 │  detectController     │   │
 │  poll()               │   │
 │  ● proxy to FastAPI   │   │
 │  ● persistThreatRows  │   │
 │    (scanId, networkId)│   │
 │  ● RPC recompute      │   │
 │  ● updateNetworkRisk  │   │
 └──────────┬───────────┘   │
            │               │
            └───────────────┘
                │
     ┌──────────┴──────────────────┐
     │         OR                   │
     ▼                              ▼
 ┌────────────────┐     ┌────────────────────┐
 │  Manual STOP    │     │  Heartbeat timeout  │
 │  stopDetection()│     │  getStatusAndMaybe  │
 │                 │     │  Fail()             │
 │ ● state→STOPPED │     │ ● state→FAILED      │
 │ ● final RPC     │     │ ● final RPC         │
 │ ● scan_end=now  │     │ ● scan_end=now      │
 │ ● updateNetwork │     │ ● updateNetwork     │
 │   Risk          │     │   Risk              │
 └────────────────┘     └────────────────────┘
```

---

## Data Model Roles

### `scans` (bigint PK)
- One row per scan session (vulnerability snapshot + continuous detection).
- `risk_score` (0–100): **set exclusively by RPC `compute_scan_risk`**; never written by JS.
- `scan_end`: stamped on STOP or FAILED finalization.

### `vulnerabilities_threat`
- Current/latest state of each (scan_id, vt_detail_id) pair.
- `vt_status`: `'ACTIVE'` (threat present) or `'INACTIVE'` (cleared).
- `occurrence_count`: incremented each time a DETECTED event arrives.
- `first_seen_at` / `last_seen_at`: lifecycle timestamps.
- The RPC counts only rows where `vt_status = 'ACTIVE'`.

### `vulnerability_threat_events`
- Append-only event history log.
- One row per DETECTED or CLEARED event per poll cycle.
- Used for audit trail / forensic timeline; NOT read by the RPC.

### `detection_state`
- Single row (device_id=1).
- `active_scan_id` (bigint): the scan session currently being monitored.
- `active_network_id` (UUID): the network being monitored.
- `status`: RUNNING | STOPPED | FAILED.
- Source of truth for which scan_id to use during threat persistence.

### `networks` risk fields
- `risk_score` (numeric): latest computed score propagated from `updateNetworkRisk`.
- `risk_bucket` (enum): LOW | MEDIUM | HIGH | CRITICAL.
- `risk_score_version` (int): monotonically incremented on each real change.
- `ap_enabled` (bool): if true, portal auto-patch triggers on risk change.

---

## Scoring Source of Truth

> **`scans.risk_score` is set ONLY by the Supabase RPC `public.compute_scan_risk(p_scan_id bigint)`.**
>
> No JavaScript code path may write to `scans.risk_score` directly.
> The RPC reads `vulnerabilities_threat` rows for the given `scan_id`,
> counts only those with `vt_status = 'ACTIVE'`, applies the canonical formula,
> updates `scans.risk_score` in-place, and returns the integer result (0–100).

---

## Bucketization Table

| Score range | Bucket     |
|-------------|------------|
| 0           | LOW        |
| 1 – 39      | LOW        |
| 40 – 69     | MEDIUM     |
| 70 – 89     | HIGH       |
| 90 – 100    | CRITICAL   |

The `networks.risk_bucket` column has a CHECK constraint with values:
`LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (no `NONE`).

---

## Stop / Failed Behavior

### What freezes
- `vulnerabilities_threat` rows remain in their last state (ACTIVE / INACTIVE).
- No bulk-clear or deletion occurs on stop or fail.

### What recomputes
- `compute_scan_risk(active_scan_id)` is called one final time.
- `scans.scan_end` is set to `now()`.
- `updateNetworkRisk()` is called with the final score + bucket so the network
  and portal reflect the last known risk.

### Error handling
- All finalization actions are best-effort (wrapped in `.catch()`).
- A failure in finalization must never block the state transition to STOPPED / FAILED.

---

## Testing Checklist (manual steps)

### Pre-requisites
- Backend running, FastAPI (Pi) reachable, Supabase connected.
- At least one network + scan row exists.

### Phase 1: RPC scoring
- [ ] Trigger a scan → save. Verify `scans.risk_score` was set by RPC (check DB).
- [ ] Start detection → let it poll once with a detected threat.
- [ ] Verify `scans.risk_score` in DB matches `compute_scan_risk` output.
- [ ] `grep -r "computeRiskScore" backend/controllers/ backend/server.js` → no usage in production paths.

### Phase 2: detection_state scan ID
- [ ] Start detection. Verify `detection_state.active_scan_id` matches the scan row.
- [ ] Poll → threat detected → verify `vulnerabilities_threat.scan_id` = `active_scan_id`.
- [ ] Verify `vulnerability_threat_events` has a DETECTED row.
- [ ] Clear threat → verify event CLEARED row + `vulnerabilities_threat.vt_status = 'INACTIVE'`.
- [ ] `grep -r "findLatestScanIdForBssid" backend/` → zero matches.

### Phase 3: Stop / FAILED finalization
- [ ] Manual stop → verify `scans.scan_end IS NOT NULL` and `risk_score` is fresh.
- [ ] Simulate heartbeat timeout (stop FastAPI, wait 30s).
- [ ] Verify state transitions to FAILED, `scan_end` set, `risk_score` set.
- [ ] Verify `vulnerabilities_threat` rows are NOT deleted on stop/fail.

### Phase 4: Bucketization + network risk
- [ ] `bucketize(0)` = LOW, `bucketize(39)` = LOW, `bucketize(40)` = MEDIUM.
- [ ] `bucketize(69)` = MEDIUM, `bucketize(70)` = HIGH, `bucketize(89)` = HIGH.
- [ ] `bucketize(90)` = CRITICAL, `bucketize(100)` = CRITICAL.
- [ ] After a poll cycle, `networks.risk_score` = RPC score (not 0).
- [ ] After a poll cycle, `networks.risk_bucket` matches the bucket table.
- [ ] If `ap_enabled`, verify portal patch triggers with actual score.
