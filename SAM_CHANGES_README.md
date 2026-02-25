# SAM — Vulnerability Detail Modal Fix

## Summary

Clicking **"View Details"** on a vulnerability row in the SAM page was crashing with:

```
ReferenceError: vulnRow is not defined
  at fetchVulnDetail (useSAM.js:236:17)
  at openVulnDetail (SAM.jsx:241:5)
  at onClick (VulnerabilitiesTable.jsx:257:44)
```

The modal would open but stay stuck on "Loading..." because no detail data was ever set.

### Root Causes

1. **`fetchVulnDetail` referenced an undefined variable** — the function parameter was named `vulnIdOrName`, but the body used `vulnRow`.
2. **No backend endpoint existed** for vulnerability details — only `/api/sam/threats/:idOrName` was implemented; there was no equivalent for vulnerabilities.
3. **Lookup key order was wrong** — `id` was preferred over `name`, but `id` is a numeric Supabase row ID (e.g. `306`), not a `vt_code`. The DB lookup found nothing and returned generic placeholder data.
4. **CVSS vector string was hardcoded to `"N/A"`** — the `vt_cvss_vector_string` column existed in the `vulnerability_threat_details` table but was never queried.

---

## Files Changed

### 1. `backend/controllers/samController.js`

**What changed:**

- **Added `getVulnDetail` function** — mirrors `getThreatDetail` but for vulnerabilities. Queries the `vulnerability_threat_details` table by `vt_code` (if the key looks like one, e.g. `WFVT-001`) or by `vt_name` (case-insensitive). Returns a JSON response with:
  - `severity` — from `vt_severity_rating`
  - `name` — from `vt_name`
  - `cvss` — from `vt_cvss_base_score`
  - `cvssVector` — from `vt_cvss_vector_string`
  - `description` — generated default text including the `vt_code`
  - `recommendations` — default NIST and OWASP recommendations
- If the vulnerability is **not found in the DB**, returns a generic detail with the looked-up name (does not 404 — allows the modal to still display useful info).
- **Added `vt_cvss_vector_string`** to both `getThreatDetail` and `getVulnDetail` select queries so the CVSS vector is returned from the database instead of being hardcoded to `"N/A"`.
- **Exported `getVulnDetail`** alongside `getThreatDetail`.

### 2. `backend/routes/samRoutes.js`

**What changed:**

- **Added route:** `GET /api/sam/vulnerabilities/:idOrName` → `getVulnDetail`
- Imported `getVulnDetail` from `samController`.

**Route table (after change):**

| Method | Path                              | Handler          |
|--------|-----------------------------------|------------------|
| GET    | `/api/sam/threats/:idOrName`      | `getThreatDetail` |
| GET    | `/api/sam/vulnerabilities/:idOrName` | `getVulnDetail` |

### 3. `src/hooks/useSAM.js` — `useVulnerabilities` hook

**What changed:**

- **Renamed parameter** from `vulnIdOrName` to `vulnRow` — the caller (`SAM.jsx`) passes the entire vulnerability row object, not just a name/ID string.
- **Lookup key order fixed** — uses `vulnRow.name` first (matches `vt_name` in DB), falls back to `vulnRow.id` only if name is missing. Previously `id` was tried first, which sent a numeric row ID like `306` that matched nothing.
- **API-first with local fallback:**
  1. Calls `getVulnerabilityDetail(lookupKey)` from `samApi.js` to fetch rich data from the backend.
  2. If the API call succeeds, merges API data with local row data (observed config, detected time) and sets `vulnDetail`.
  3. If the API call fails (network error, 404, etc.), builds the detail entirely from the local row data so the modal still shows something useful.
- **Added `defaultVulnDescription` helper** — generates a description string from the row's name and observed config when no DB description is available.

### 4. `src/pages/SAM/SAM.jsx` (no code change needed)

The `openVulnDetail` function already passes the whole `vuln` row object to `fetchVulnDetail(vuln)`. No changes were required here — the fix was making `fetchVulnDetail` correctly accept and use that object.

### 5. `src/components/sam/VulnerabilitiesTable.jsx` (no code change needed)

The `onClick` handler already calls `onView(vuln)` with the full row. No changes were required.

### 6. `src/api/samApi.js` (no code change needed)

`getVulnerabilityDetail(idOrName)` was already implemented and calls `GET /api/sam/vulnerabilities/:idOrName`. It just had no backend endpoint to hit before. Now it does.

### 7. `src/components/modals/FindingDetailModal/FindingDetailModal.jsx` (no code change needed)

The modal expects a `vulnerability` prop with shape `{ severity, name, cvss, cvssVector, description, recommendations: { nist[], owasp[] } }`. The fix ensures `fetchVulnDetail` produces this exact shape.

---

## Data Flow (After Fix)

```
User clicks "View Details" on a vulnerability row
        │
        ▼
VulnerabilitiesTable.jsx → onView(vuln)  // passes full row object
        │
        ▼
SAM.jsx → openVulnDetail(vuln)
        │  setIsModalOpen(true)
        │  fetchVulnDetail(vuln)          // passes whole row
        │
        ▼
useSAM.js → fetchVulnDetail(vulnRow)
        │  lookupKey = vulnRow.name       // e.g. "Open Network"
        │
        ▼
samApi.js → GET /api/sam/vulnerabilities/Open%20Network
        │
        ▼
samRoutes.js → getVulnDetail(req, res)
        │
        ▼
samController.js → queries vulnerability_threat_details
        │            WHERE vt_name ILIKE 'Open Network'
        │
        ▼
Returns JSON: { severity, name, cvss, cvssVector, description, recommendations }
        │
        ▼
useSAM.js → setVulnDetail({ ...apiData, observedConfig, detectedTime })
        │
        ▼
FindingDetailModal renders with full detail data
```

---

## Database Table Referenced

**`vulnerability_threat_details`** — columns used:

| Column                   | Usage                        |
|--------------------------|------------------------------|
| `vt_code`                | Lookup key (e.g. `WFVT-001`)|
| `vt_name`                | Lookup fallback + display    |
| `vt_kind`                | `"threat"` or `"vulnerability"` |
| `vt_cvss_base_score`     | CVSS score (e.g. `9.4`)     |
| `vt_severity_rating`     | Severity label (e.g. `CRITICAL`) |
| `vt_cvss_vector_string`  | CVSS vector (e.g. `AV:A/AC:L/...`) |
