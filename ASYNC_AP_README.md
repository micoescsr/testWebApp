# Async AP Orchestration — Changes from Synchronous Model

Reference for the `mar15-async` branch. Documents the migration from the synchronous "wait for `/orchestrate/apply` to finish" model to an async job-based orchestration flow.

---

## Table of Contents

1. [Summary of Change](#summary-of-change)
2. [Why Async](#why-async)
3. [Old vs New — Behavioral Comparison](#old-vs-new--behavioral-comparison)
4. [Architecture](#architecture)
5. [Pi / FastAPI Contract](#pi--fastapi-contract)
6. [Backend Changes](#backend-changes)
   - [apJobStore.js (NEW)](#backendservicesapjobstorejs-new)
   - [routeValidators.js (MODIFIED)](#backendvalidatorsroutevalidatorsjs-modified)
   - [deviceMgmtRoutes.js (MODIFIED)](#backendroutesdevicemgmtroutesjs-modified)
7. [Frontend Changes](#frontend-changes)
   - [deviceApi.js (MODIFIED)](#srcapideviceapijs-modified)
   - [pollUntil.js (NEW)](#srcutilspolluntiljs-new)
   - [useDevice.js (MODIFIED)](#srchooksusedevicejs-modified)
   - [AccessPointPanel.jsx (MODIFIED)](#srccomponentsdeviceaccesspointpaneljsx-modified)
   - [DeviceManagement.jsx (MODIFIED)](#srcpagesdevicemanagementdevicemanagementjsx-modified)
8. [Test Changes](#test-changes)
9. [Database Schema](#database-schema)
10. [Error Codes (New)](#error-codes-new)
11. [Banner Priority Table](#banner-priority-table)
12. [Recovery & Edge Cases](#recovery--edge-cases)
13. [Files Modified — Quick Reference](#files-modified--quick-reference)

---

## Summary of Change

The old model sent `POST /orchestrate/apply` to the Pi and **blocked** the Express response until the Pi finished (~5–12 s). The frontend set a loading spinner and waited for the HTTP response.

The new model sends the same request with `async: true`. The Pi returns `202 ACCEPTED` with a `job_id` immediately. The frontend then **polls** for completion via two new backend routes (`GET /jobs/:jobId` and `GET /ap-live`), showing real-time progress banners.

**What stays the same:**
- HMAC-signed `piFetch` proxy (backend-as-proxy architecture)
- Supabase concurrency lock (`ap_apply_in_progress` + `ap_apply_locked_at`)
- Scan freshness validation, network config validation, AP password checks
- Captive portal auto-init on first enable, post-enable portal patching
- Audit logging for all state transitions
- The synchronous fallback — if the Pi returns a non-ACCEPTED response, the old sync path still executes

---

## Why Async

| Problem (old model)                            | Solution (new model)                    |
| ---------------------------------------------- | --------------------------------------- |
| 5–12 s blocking request; risks gateway timeout | Pi returns ACCEPTED immediately (~200ms) |
| Single 504 error discards 10 s of Pi work      | Job persists; recovery on reconnect      |
| No progress visibility during apply            | Polling shows ACCEPTED → ONGOING → DONE  |
| Lock released on timeout, but Pi still working | Lock held until terminal (DONE/FAILED)   |
| No way to resume after browser refresh         | `sessionStorage`-persisted `jobId`       |

---

## Old vs New — Behavioral Comparison

### Old Flow (synchronous)
```
Frontend                Express                  Pi
   │ POST /enable-ap ──────▶│                        │
   │                        │ POST /orchestrate/apply│
   │                        │───────────────────────▶│
   │    (blocks 5-12s)      │     (blocks 5-12s)     │
   │                        │◀───────────────────────│ { status: "ok" }
   │◀──────────────────────│ 200 { ok, ap_enabled }  │
   │  setState, stop spinner│                        │
```

### New Flow (async)
```
Frontend                Express                  Pi
   │ POST /enable-ap ──────▶│                        │
   │                        │ POST /orchestrate/apply│
   │                        │  (body: async: true)   │
   │                        │───────────────────────▶│
   │                        │◀───────────────────────│ { status: "ACCEPTED", job_id }
   │◀──────────────────────│ 200 { status: "ACCEPTED", job_id }
   │                        │                        │
   │  Start job poll loop   │                        │
   │ GET /jobs/:jobId ─────▶│                        │
   │                        │ GET /orchestrate/poll  │
   │                        │───────────────────────▶│
   │                        │◀───────────────────────│ { status: "ONGOING" }
   │◀──────────────────────│ { job_status: "ONGOING" }
   │  (repeat every 2.5s)   │                        │
   │  ...                   │                        │
   │ GET /jobs/:jobId ─────▶│                        │
   │                        │◀───────────────────────│ { status: "DONE", result }
   │◀──────────────────────│ { job_status: "DONE" }  │
   │                        │ ▶ finalizeJob():       │
   │                        │   UPDATE networks …    │
   │                        │   portal/patch         │
   │                        │   release lock         │
   │                        │                        │
   │  Start AP live poll    │                        │
   │ GET /ap-live ─────────▶│ GET /ap/poll ─────────▶│
   │◀──────────────────────│ { ap_status: "ENABLED" }│
   │  Confirmed! Clear job  │                        │
```

---

## Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌────────────┐
│  React UI    │─────▶│   Express API    │─────▶│  FastAPI    │
│ (useDevice)  │◀─────│ deviceMgmtRoutes │◀─────│  (Rasp Pi) │
│              │      │                  │      │            │
│ pollUntil()  │      │  apJobStore (V1) │      │ /orch/apply│
│ sessionState │      │  finalizeJob()   │      │ /orch/poll │
│ job banners  │      │  /jobs/:jobId    │      │ /ap/poll   │
└──────────────┘      │  /ap-live        │      └────────────┘
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │    Supabase      │
                      │   (PostgreSQL)   │
                      │ networks table   │
                      │ (lock columns)   │
                      └──────────────────┘
```

---

## Pi / FastAPI Contract

Three endpoints are involved. All calls go through `piFetch()` (HMAC-signed).

| Endpoint | Method | When Used | Key Fields |
| --- | --- | --- | --- |
| `/orchestrate/apply` | POST | Enable/disable AP | Request: `{ ssid, bssid, channel, encryption_type, ap_password, ap_status, async: true }`. Response: `{ status: "ACCEPTED", job_id }` |
| `/orchestrate/poll` | GET | Job status check | Query: `?job_id=orch_...`. Response: `{ status: "ONGOING"\|"DONE", job_id, result }` |
| `/ap/poll` | GET | Live hardware state | Response: `{ ap_enabled, ap_status, uplink: { status } }` |

**Job ID format:** `orch_<unix_timestamp>_<hex8>` — e.g. `orch_1773418826_72ddfac4`

**Terminal statuses:** `DONE` (check `result.status` for success vs error), `FAILED`

---

## Backend Changes

### `backend/services/apJobStore.js` (NEW)

**Purpose:** Temporary in-memory job store. Tracks async AP jobs between the initial ACCEPTED response and terminal finalization. V1 only — intended to be replaced with a database-backed `ap_jobs` table when persistence across server restarts is needed.

**Job object schema:**

| Field | Type | Description |
| --- | --- | --- |
| `job_id` | string | Pi-generated ID (`orch_...`) |
| `network_id` | string (UUID) | Which network this job is for |
| `scan_id` | string \| null | Scan used for enable (null for disable) |
| `target_ap_status` | `"enable"` \| `"disable"` | What the job is trying to do |
| `status` | string | `ACCEPTED` → `ONGOING` → `DONE` \| `FAILED` |
| `payload_snapshot` | object | Copy of the orchestrate/apply payload (for debugging) |
| `result` | object \| null | Pi's terminal result payload |
| `error_code` | string \| null | Classified error code on failure |
| `error_message` | string \| null | Human-readable error on failure |
| `finalized` | boolean | `true` once `finalizeJob()` has run (prevents double-execution) |
| `created_at` | ISO string | Job creation time |
| `updated_at` | ISO string | Last poll update |
| `completed_at` | ISO string \| null | When terminal status was first set |

**Key methods:**

- `create({ job_id, network_id, scan_id, target_ap_status, payload_snapshot })` — Stores new job with `status: "ACCEPTED"`, `finalized: false`
- `get(jobId)` — Returns job or `null`
- `getActiveForNetwork(networkId)` — Returns the first non-terminal, non-finalized job for a network, or `null`. Used for duplicate-job prevention (409 check)
- `update(jobId, fields)` — Merges fields; auto-sets `completed_at` when status becomes terminal
- `markFinalized(jobId)` — Sets `finalized: true` (idempotent, safe for missing jobs)
- `cleanup()` — Runs on a 5-minute interval. Removes terminal jobs whose `completed_at` is older than 10 minutes
- `_reset()` — Clears all jobs (used in tests)

---

### `backend/validators/routeValidators.js` (MODIFIED)

**What changed:** Added `param` import from `express-validator` and a new `deviceJobPoll` validator array.

```js
const JOB_ID_RE = /^orch_\d+_[a-f0-9]+$/;

const deviceJobPoll = [
  param('jobId')
    .exists({ checkFalsy: true }).withMessage('jobId is required')
    .isString()
    .isLength({ max: 64 }).withMessage('jobId must be at most 64 characters')
    .matches(JOB_ID_RE).withMessage('jobId format is invalid'),
];
```

**Why:** The `GET /jobs/:jobId` route validates the `:jobId` param format before proxying to the Pi. This prevents injection of arbitrary query strings into the Pi's `/orchestrate/poll?job_id=` endpoint.

---

### `backend/routes/deviceMgmtRoutes.js` (MODIFIED)

This is the largest change. Six additions were made to the existing route file:

#### 1. Duplicate-Job Prevention (before lock acquisition)

```js
const activeJob = apJobStore.getActiveForNetwork(network_id);
if (activeJob) {
  return res.status(409).json({
    ok: false,
    error: 'REQUEST_IN_PROGRESS',
    message: 'An AP configuration change is already in progress.',
    job_id: activeJob.job_id,
    target_ap_status: activeJob.target_ap_status,
  });
}
```

Located in `POST /enable-ap` handler, immediately after input validation but **before** the database lock attempt. If an active (non-terminal, non-finalized) job already exists for this network, returns `409` with the existing `job_id` so the frontend can resume polling instead of creating a duplicate.

#### 2. Async ACCEPTED Handling — DISABLE Path

After calling `piFetch('/orchestrate/apply', { method: 'POST', jsonBody: { ...payload, async: true }, timeoutMs: 15_000 })`, the DISABLE branch now checks for an ACCEPTED response:

```js
if (fastapiData?.status === 'ACCEPTED' && fastapiData?.job_id) {
  asyncJobAccepted = true;
  const job = apJobStore.create({
    job_id: fastapiData.job_id,
    network_id,
    scan_id: null,
    target_ap_status: 'disable',
    payload_snapshot: orchestratePayload,
  });
  // audit event logged with eventStatus: 'ACCEPTED'
  return res.json({ ok: true, status: 'ACCEPTED', job_id: job.job_id, ... });
}
```

If the Pi does **not** return ACCEPTED (sync fallback), the rest of the old sync disable path executes unchanged.

#### 3. Async ACCEPTED Handling — ENABLE Path

Identical pattern for the enable branch, with `scan_id` tracked:

```js
if (fastapiData?.status === 'ACCEPTED' && fastapiData?.job_id) {
  asyncJobAccepted = true;
  const job = apJobStore.create({
    job_id: fastapiData.job_id,
    network_id,
    scan_id: scan.scan_id,
    target_ap_status: 'enable',
    payload_snapshot: orchestratePayload,
  });
  // audit event logged with eventStatus: 'ACCEPTED'
  return res.json({ ok: true, status: 'ACCEPTED', job_id: job.job_id, ... });
}
```

#### 4. Conditional Lock Release in `finally` Block

**Old behavior:** The `finally` block always released the DB lock.

**New behavior:**

```js
finally {
  if (lockAcquired && !asyncJobAccepted) {
    await releaseApLock(network_id);
  }
}
```

When `asyncJobAccepted` is `true`, the lock is **kept**. It is only released later by `finalizeJob()` when the job reaches a terminal state (DONE or FAILED). This prevents a race where the lock is released while the Pi is still processing.

#### 5. `finalizeJob()` — Idempotent Job Completion

New `async function finalizeJob(job, piResult)` handles all terminal-state side effects:

1. **Idempotency guard:** If `job.finalized` is already `true`, returns immediately
2. **Lock verification:** Checks that `ap_apply_in_progress` is still `true` in the DB. If someone else already released it, marks finalized and returns
3. **On enable + DONE:**
   - Sets `ap_enabled: true`, `ap_last_applied_at` in DB
   - Attempts portal patch via `piFetch('/portal/patch')` (non-fatal if it fails)
   - Stamps `portal_last_patched_at` on success
4. **On disable + DONE:**
   - Sets `ap_enabled: false`, `ap_last_applied_at` in DB
5. **On FAILED:**
   - Does **not** change `ap_enabled` — leaves the DB in its previous state
6. **Always:**
   - Calls `releaseApLock(networkId)` to clear `ap_apply_in_progress`
   - Calls `apJobStore.markFinalized(job.job_id)`

#### 6. `GET /api/device/jobs/:jobId` — Job Polling Endpoint

New route: `router.get('/jobs/:jobId', authJWT, deviceJobPoll, validate, handler)`

**Flow:**

1. Check `apJobStore` for the job. If `finalized`, return cached terminal result immediately (no Pi call)
2. Otherwise, call `piFetch('/orchestrate/poll', { query: { job_id: jobId } })`
3. If Pi is unreachable: return `{ job_status: 'UNKNOWN', error_code: 'PI_UNREACHABLE' }`
4. Normalize upstream status:
   - `DONE` + `result.status === 'ERROR'` → `FAILED` (classify via `classifyOrchestrateError`)
   - `DONE` + success → `DONE`
   - Anything else → `ONGOING`
5. On terminal status, call `finalizeJob()` to persist DB changes and release lock
6. Return normalized response to frontend

**Response shape:**

```json
{
  "ok": true|false,
  "job_id": "orch_...",
  "job_status": "ACCEPTED|ONGOING|DONE|FAILED|UNKNOWN",
  "result": { ... },
  "error_code": "CONNECTION_FAILED|PI_UNREACHABLE|...",
  "error_message": "Human-readable description"
}
```

#### 7. `GET /api/device/ap-live` — Live AP Hardware State

New route: `router.get('/ap-live', authJWT, handler)`

Proxies `piFetch('/ap/poll')` and normalizes the Pi's response to a canonical vocabulary:

| Pi Field | Normalized `ap_status` |
| --- | --- |
| `ap_status: "enabled"`, `ap_enabled: true` | `ENABLED` |
| `ap_status: "disabled"`, `ap_enabled: false` | `DISABLED` |
| `ap_status: "transitioning"` / `"starting"` / `"stopping"` | `TRANSITIONING` |
| Pi unreachable or unknown | `UNKNOWN` |

Also normalizes `uplink.status` → `CONNECTED` | `DISCONNECTED` | `UNKNOWN`.

**Response shape:**

```json
{
  "ok": true,
  "ap_status": "ENABLED",
  "is_transitioning": false,
  "uplink_status": "CONNECTED",
  "raw": { ... }
}
```

---

## Frontend Changes

### `src/api/deviceApi.js` (MODIFIED)

**What changed:** Two new API functions added.

```js
export const pollApJob = (jobId) =>
  api.get(`/device/jobs/${encodeURIComponent(jobId)}`);

export const pollApLive = () =>
  api.get('/device/ap-live');
```

These are used by `useDevice` to poll job progress and verify actual hardware state after a job completes.

---

### `src/utils/pollUntil.js` (NEW)

**Purpose:** Generic polling utility used by the frontend polling effects.

```js
export default async function pollUntil(fetcher, isDone, { interval, maxAttempts, signal })
```

| Param | Default | Description |
| --- | --- | --- |
| `fetcher` | — | Async function that returns a result |
| `isDone` | — | Predicate `(result) => boolean` — returns true to stop polling |
| `interval` | 2500 | Milliseconds between polls |
| `maxAttempts` | 120 | Max iterations before throwing |
| `signal` | — | `AbortSignal` for cleanup (throws `AbortError`) |

Returns the final result that caused `isDone` to return `true`. Throws on abort or max-attempts exceeded.

---

### `src/hooks/useDevice.js` (MODIFIED)

This is the most significant frontend change. The hook gained async job state management, two polling effects, and modified toggle handling.

#### New State

| Variable | Storage | Purpose |
| --- | --- | --- |
| `jobId` | `sessionStorage` (`wf:ap-job-id:{networkId}`) | Pi's job ID — persists across component remounts and page refreshes |
| `jobStatus` | `sessionStorage` (`wf:ap-job-status:{networkId}`) | Current status: `ACCEPTED` → `ONGOING` → `DONE` \| `FAILED` |
| `targetApStatus` | `sessionStorage` (`wf:ap-target:{networkId}`) | `"enable"` or `"disable"` — what the job is trying to do |
| `jobError` | `useState` (local) | `{ code, message }` on failure |
| `apLiveStatus` | `useState` (local) | Latest `/ap-live` result during confirmation |
| `apLiveConfirmed` | `useState` (local) | `true` once live hardware state matches `targetApStatus` |
| `isJobActive` | derived | `!!(jobId && jobStatus && !['DONE','FAILED'].includes(jobStatus))` |

#### New Refs

| Ref | Purpose |
| --- | --- |
| `jobPollAbortRef` | `AbortController` for the job polling effect — aborted on cleanup/clear |
| `livePollAbortRef` | `AbortController` for the AP live polling effect |

#### Effect 1: Job Polling

**Trigger:** `jobId` is set and `jobStatus` is not terminal (`DONE`/`FAILED`).

**Behavior:**
- Creates an `AbortController`, stores in `jobPollAbortRef`
- Calls `pollUntil(() => pollApJob(jobId), isDone, { interval: 2500, maxAttempts: 120, signal })`
  - `isDone` predicate: `job_status` is `DONE` or `FAILED`
  - Each iteration updates `jobStatus` from the response
- On `DONE`: sets `jobStatus` to `"DONE"`
- On `FAILED`: sets `jobError` from response, calls `fetchAdminState()` to refresh DB state
- On abort (component unmount / `clearJobState()`): silently exits

#### Effect 2: AP Live Polling

**Trigger:** `jobStatus === 'DONE'` (success path only — not FAILED).

**Behavior:**
- Determines `expectedApState` from `targetApStatus` (`enable` → `ENABLED`, `disable` → `DISABLED`)
- Creates `AbortController`, stores in `livePollAbortRef`
- Calls `pollUntil(() => pollApLive(), isDone, { interval: 3000, maxAttempts: 20, signal })`
  - `isDone`: `ap_status === expectedApState`
  - Each iteration updates `apLiveStatus`
- On match: sets `apLiveConfirmed = true`
- On timeout/error: sets `apLiveConfirmed = true` anyway (don't block user forever)
- After either outcome: waits 2 s, refreshes admin state, then calls `clearJobState()`

#### 12-Second Admin State Polling — Suspension

**Old behavior:** `setInterval` ran every 12 s unconditionally when AP was enabled.

**New behavior:** The interval is created only when `!isJobActive`. While an async job is running, the 12 s polling is suspended to avoid state flickering. It resumes automatically when job state is cleared.

#### `handleToggleAccessPoint()` Changes

- **ACCEPTED response** (`res.data.status === 'ACCEPTED'`): Sets `jobId`, `jobStatus = 'ACCEPTED'`, `targetApStatus`. Returns early (keeps `loading = true` for spinner continuity until polling takes over).
- **409 conflict** (`status === 409`): Resumes existing job by setting `jobId` from response, `jobStatus = 'ONGOING'`, `targetApStatus` from response.
- **502/503/504 timeout**: Enters bounded reconciliation timeout (unchanged from before, but now also compatible with async lock holding).

#### `clearJobState()`

Aborts both polling effects and resets all job-related state:

```js
const clearJobState = useCallback(() => {
  jobPollAbortRef.current?.abort();
  livePollAbortRef.current?.abort();
  setJobId(null);
  setJobStatus(null);
  setTargetApStatus(null);
  setJobError(null);
  setApLiveStatus(null);
  setApLiveConfirmed(false);
}, []);
```

#### New Return Values

```js
return {
  // ...all existing returns unchanged
  isJobActive,
  jobId,
  jobStatus,
  targetApStatus,
  jobError,
  apLiveStatus,
  apLiveConfirmed,
  clearJobState,
};
```

---

### `src/components/device/AccessPointPanel.jsx` (MODIFIED)

#### `computeBanner()` — New Priority Entries

The deterministic banner function gained three new priority levels, inserted between `config_missing` (P1) and `apply_in_progress`:

| Priority | Key | Condition | Meaning |
| --- | --- | --- | --- |
| P1 | `config_missing` | *(unchanged)* | Network missing ssid/bssid/channel |
| **P2** | **`job_active`** | `isJobActive === true` | Async job running (ACCEPTED or ONGOING) |
| **P3** | **`job_confirming`** | `jobStatus === 'DONE' && !apLiveConfirmed` | Job done, waiting for hardware confirmation |
| **P4** | **`job_failed`** | `jobStatus === 'FAILED' \|\| jobError` | Job failed with an error |
| P5 | `apply_in_progress` | *(unchanged — sync fallback)* | Old sync lock without an active async job |
| P6+ | *(...rest unchanged)* | | |

#### New Banner Renderings

**`job_active`:**
> **Enabling/Disabling access point…**
> This may take up to a minute. Do not close this tab.

**`job_confirming`:**
> **Verifying device state…**
> Confirming the access point is active / has stopped.

**`job_failed`:**
> **{error message}**
> You can retry the operation. [Retry button]

#### Toggle Button — Disabled States

Added to `toggleDisabled`:
- `isJobActive` — can't toggle while a job is running
- `jobStatus === 'DONE' && !apLiveConfirmed` — can't toggle during hardware confirmation

#### Password Input

Disabled during `isJobActive` to prevent edits while an operation is running.

#### New Props

| Prop | Type | Source |
| --- | --- | --- |
| `isJobActive` | boolean | `useDevice` |
| `jobStatus` | string \| null | `useDevice` |
| `jobError` | `{ code, message }` \| null | `useDevice` |
| `apLiveConfirmed` | boolean | `useDevice` |
| `targetApStatus` | `"enable"` \| `"disable"` \| null | `useDevice` |
| `onRetry` | function | `DeviceManagement.jsx` (calls `clearJobState()` → `refetch()`) |

---

### `src/pages/DeviceManagement/DeviceManagement.jsx` (MODIFIED)

**What changed:** Destructures new values from `useDevice` and passes them to `AccessPointPanel`.

**Destructuring:**
```js
const {
  // ...existing
  isJobActive,
  jobStatus,
  jobError,
  apLiveConfirmed,
  targetApStatus,
  clearJobState,
} = useDevice(networkId, scanId);
```

**Prop passthrough:**
```jsx
<AccessPointPanel
  // ...existing
  isJobActive={isJobActive}
  jobStatus={jobStatus}
  jobError={jobError}
  apLiveConfirmed={apLiveConfirmed}
  targetApStatus={targetApStatus}
  onRetry={() => {
    clearJobState();
    refetch();
    refetchState();
  }}
/>
```

**`onRetry` handler:** Clears all async job state (aborts polls, resets session storage), then refreshes both the scan data and admin state from the database.

---

## Test Changes

### `backend/__tests__/unit/apJobStore.test.js` (NEW)

14 unit tests covering the full `apJobStore` API:

| Test | What it verifies |
| --- | --- |
| `create()` stores with defaults | Status = ACCEPTED, finalized = false, timestamps set |
| `get()` returns correct job | Lookup by ID |
| `get()` returns null for missing | No crash on unknown ID |
| `getActiveForNetwork()` finds non-terminal | Returns ongoing job for network |
| `getActiveForNetwork()` ignores DONE | Terminal jobs are not "active" |
| `getActiveForNetwork()` ignores FAILED | Failed jobs are not "active" |
| `update()` merges and bumps timestamp | Partial updates work |
| `update()` returns null for missing | Missing job returns null |
| `markFinalized()` sets flag | Idempotent finalization |
| `markFinalized()` safe for missing | No crash on unknown ID |
| `cleanup()` removes stale terminal | Jobs older than 10 min TTL evicted |
| `cleanup()` keeps active jobs | Non-terminal jobs never evicted |
| `cleanup()` keeps recent terminal | Recently completed jobs kept |
| `_reset()` clears all | Test isolation |

### `backend/__tests__/fixtures/deviceMgmtPayloads.js` (MODIFIED)

Six new fixtures added:

| Fixture | Shape | Used In |
| --- | --- | --- |
| `fastapiAccepted` | `{ status: "ACCEPTED", job_id: "orch_...", message }` | Section E |
| `orchestratePollOngoing` | `{ status: "ONGOING", job_id, result: null }` | Section F |
| `orchestratePollDone` | `{ status: "DONE", job_id, result: { status: "ok" } }` | Section F |
| `orchestratePollFailed` | `{ status: "DONE", job_id, result: { status: "ERROR", error_code, user_message } }` | Section F |
| `apPollEnabled` | `{ ap_enabled: true, ap_status: "enabled", uplink: { status: "connected" } }` | Section G |
| `apPollDisabled` | `{ ap_enabled: false, ap_status: "disabled", uplink: { status: "disconnected" } }` | Section G |

### `backend/__tests__/integration/deviceMgmt.test.js` (MODIFIED)

**Test infrastructure fixes:**
- Added `jest.mock("@supabase/supabase-js")` for auth middleware profile lookup
- Added `authGet()` / `authPost()` helpers with `Authorization: Bearer test-token` header
- Fixed `chain()` helper: `update()` now returns a deeply-chainable mock supporting `.update().eq().eq().select().maybeSingle()` (required by the atomic lock query)
- All fetch mocks use `text()` (not `json()`) to match `piFetch()`'s actual behavior (`res.text()` + `JSON.parse()`)

**Three new test sections:**

#### Section E: `POST /api/device/enable-ap` — async ACCEPTED (2 tests)

Uses valid UUIDs (not the old `NETWORK_ID = "net-abc-123"` fixture) to pass route validation.

| Test | Status | Asserts |
| --- | --- | --- |
| Returns ACCEPTED with job_id when Pi accepts async | 200 | `status: "ACCEPTED"`, `job_id` populated, `ok: true` |
| 409 when async job is already active for network | 409 | `error: "REQUEST_IN_PROGRESS"`, existing `job_id` returned |

#### Section F: `GET /api/device/jobs/:jobId` (6 tests)

| Test | Status | Asserts |
| --- | --- | --- |
| 400 for invalid jobId format | 400 | Bad format rejected by validator |
| Returns ONGOING when Pi reports ongoing | 200 | `job_status: "ONGOING"`, `ok: true` |
| Returns DONE and finalizes job | 200 | `job_status: "DONE"`, store `finalized: true` |
| Cached result for finalized job (no Pi call) | 200 | `global.fetch` not called |
| Returns FAILED when Pi result is ERROR | 200 | `job_status: "FAILED"`, `ok: false`, `error_code` set |
| PI_UNREACHABLE when fetch fails | 200 | `job_status: "UNKNOWN"`, `error_code: "PI_UNREACHABLE"` |

#### Section G: `GET /api/device/ap-live` (3 tests)

| Test | Status | Asserts |
| --- | --- | --- |
| Returns ENABLED when Pi reports AP enabled | 200 | `ap_status: "ENABLED"`, `uplink_status: "CONNECTED"` |
| Returns DISABLED when Pi reports AP disabled | 200 | `ap_status: "DISABLED"` |
| Returns UNKNOWN when Pi is unreachable | 200 | `ap_status: "UNKNOWN"`, `ok: false` |

### `backend/__tests__/setup.js` (MODIFIED)

Added `process.env.PI_SIGNING_OPTIONAL = "true"` to allow tests to run without the `CONTROL_SIGNING_SECRET` environment variable (piFetch skips HMAC signing when this is set).

---

## Database Schema

**No schema changes required.** The async flow reuses existing columns:

| Column | Table | Used For |
| --- | --- | --- |
| `ap_apply_in_progress` | `networks` | Concurrency lock — held until `finalizeJob()` runs |
| `ap_apply_locked_at` | `networks` | Stale lock detection (TTL-based auto-expire) |
| `ap_enabled` | `networks` | Updated by `finalizeJob()` on DONE |
| `ap_last_applied_at` | `networks` | Timestamp set by `finalizeJob()` |

Job state lives in-memory (`apJobStore`). If the Express server restarts mid-job, the job is lost but the lock will auto-expire after `AP_LOCK_TTL_SECONDS` (default 120 s), allowing a retry.

---

## Error Codes (New)

| Code | HTTP | Source | Meaning |
| --- | --- | --- | --- |
| `REQUEST_IN_PROGRESS` | 409 | `POST /enable-ap` | Another async job is already active for this network |
| `PI_UNREACHABLE` | 200 * | `GET /jobs/:jobId` | Could not reach the Pi to check job status |
| `POLL_ERROR` | 200 * | `GET /jobs/:jobId` | Unexpected error during poll |

\* The `/jobs/:jobId` route always returns 200 with `ok: false` for Pi-communication errors, since the job itself may still be running.

---

## Banner Priority Table

Full priority order after changes (highest priority first):

| # | Banner Key | Condition | User Sees |
| --- | --- | --- | --- |
| 1 | `config_missing` | Network missing ssid/bssid/channel | "Network configuration is incomplete" |
| **2** | **`job_active`** | `isJobActive` | "Enabling/Disabling access point…" |
| **3** | **`job_confirming`** | `jobStatus === 'DONE' && !apLiveConfirmed` | "Verifying device state…" |
| **4** | **`job_failed`** | `jobStatus === 'FAILED' \|\| jobError` | Error message + Retry button |
| 5 | `apply_in_progress` | `apApplyInProgress` (sync fallback) | "Configuration change in progress…" |
| 6 | `scan_error` | Scan data has errors | Error details |
| 7 | `enable_needs_scan` | AP enabled but no valid scan | "Scan required" |
| 8 | `scan_stale` | Scan too old | "Scan is outdated" |
| 9 | `portal_outdated` | Portal content out of date | "Portal needs update" |
| 10 | — (none) | Everything normal | No banner shown |

---

## Recovery & Edge Cases

| Scenario | Behavior |
| --- | --- |
| **Browser refresh during job** | `jobId` and `jobStatus` survive in `sessionStorage`. Effect resumes polling on remount. |
| **Tab close + return** | Same as refresh. If the job has finished, the first poll returns terminal (cached or live). |
| **Server restart mid-job** | In-memory job store is lost. The `/jobs/:jobId` route still proxies to Pi (no stored job context). If Pi reports DONE, finalization is skipped (no stored job to finalize). The DB lock auto-expires after TTL. |
| **Pi goes offline during job** | Polling returns `PI_UNREACHABLE`. Frontend keeps polling (up to 120 attempts = 5 min). If Pi comes back, polling resumes normally. |
| **Network switch during job** | `sessionStorage` keys are scoped by `networkId`. Switching networks loads different job state. |
| **Duplicate enable click** | Second `POST /enable-ap` returns `409` with existing `job_id`. Frontend resumes polling that job. |
| **Old sync fallback** | If Pi returns a non-ACCEPTED response (old firmware), the entire old synchronous path executes unchanged. |
| **`finalizeJob()` called twice** | Idempotent — checks `job.finalized` flag and returns immediately if already `true`. |

---

## Files Modified — Quick Reference

| File | Status | Layer |
| --- | --- | --- |
| `backend/services/apJobStore.js` | **NEW** | Backend service |
| `backend/validators/routeValidators.js` | Modified | Backend validation |
| `backend/routes/deviceMgmtRoutes.js` | Modified | Backend routes |
| `src/api/deviceApi.js` | Modified | Frontend API |
| `src/utils/pollUntil.js` | **NEW** | Frontend utility |
| `src/hooks/useDevice.js` | Modified | Frontend hook |
| `src/components/device/AccessPointPanel.jsx` | Modified | Frontend component |
| `src/pages/DeviceManagement/DeviceManagement.jsx` | Modified | Frontend page |
| `backend/__tests__/unit/apJobStore.test.js` | **NEW** | Unit tests |
| `backend/__tests__/fixtures/deviceMgmtPayloads.js` | Modified | Test fixtures |
| `backend/__tests__/integration/deviceMgmt.test.js` | Modified | Integration tests |
| `backend/__tests__/setup.js` | Modified | Test setup |
