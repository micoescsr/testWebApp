# Conditional Captive-Portal Tips (WFVT mapping + tipset freshness)

This repo supports **system-generated captive-portal “tips”** that can change based on detected Wi‑Fi findings (WFVT codes), while keeping the **Pi payload stable**.

The backend always resolves a **final flat list of tip objects** (`[{ tip_text, sort_order, is_active }]`) and sends only that list to the Pi. The Pi does **not** receive mapping metadata, code lists, or any conditional rules.

## Goals / invariants

- **Stable Pi contract**: the Pi always receives a resolved `tips.items` array of tip objects.
- **Non-technical wording**: user-facing tips avoid protocol/security jargon.
- **Backwards compatible**: legacy per-network tips (`captive_portal_tips`) still work.
- **Additive DB changes only**: new tables/columns do not drop or rewrite existing data.

## Data model

### `public.portal_tips` (global mapping table)

Migration: `backend/migrations/003_portal_tips_and_freshness.sql`

`portal_tips` is the global, system-managed source of tip templates.

- `detection_code` (text, nullable)
  - `NULL` for baseline tips
  - `WFVT-...` for detection-specific tips
- `tip_category` (text)
  - `'baseline'` or `'specific'`
- `tip_text` (text)
- `sort_order` (integer)
- `is_active` (boolean)
- `source_ref`, timestamps, etc.

Seed file (manual): `backend/seeds/portal_tips_seed.sql`

### `public.networks.portal_tipset_hash` (freshness stamp)

Migration: `backend/migrations/003_portal_tips_and_freshness.sql`

`networks.portal_tipset_hash` stores the **SHA‑256** hash of the *final resolved tips* most recently pushed to the Pi.

This is intentionally separate from `portal_last_patched_version` because **tip content can change without a risk version bump**.

## Tip resolution (what gets sent to the Pi)

Resolver: `backend/utils/portalTipResolver.js`

The backend resolves tips in this priority order:

1. **Conditional tips from `portal_tips`**
   - Try `tip_category = 'specific'` where `detection_code` matches any detected WFVT code.
   - If no specific tips match, fall back to **baseline** tips (`tip_category = 'baseline'`).
2. **Legacy per-network tips (`captive_portal_tips`)**
   - Used when `portal_tips` is missing, unavailable, or unseeded.
3. **Hardcoded defaults**
   - Last resort when no DB-backed tips are available.

### Normalization rules (patch constraints)

All sources run through the same normalizer:

- Trim whitespace
- Drop blank tips
- **Truncate** `tip_text` to **≤ 300 chars**
- **Dedupe** case-insensitively by `tip_text`
- Sort by `sort_order`, then `tip_text`
- Cap to **≤ 20 tips**

(See `finalizePortalTips()` and constants in `backend/utils/portalTipResolver.js`.)

## WFVT detection (which codes are “active”)

Code derivation: `getDetectedPortalCodesForNetwork()` in `backend/utils/portalTipResolver.js`

Detected codes are the union of:

1. **Derived open authentication** from `networks.encryption_status`
   - If open/none/unencrypted, add `WFVT-001`.
2. **Latest eligible UUID scan** from `vulnerability_scans`
   - Uses the most recent `COMPLETED` scan with `error_code IS NULL`.
   - Reads `scan_data.findings` (supports common shapes).
   - Adds a finding’s `id` as a code if its `status` is one of: `DETECTED`, `ACTIVE`, `FOUND`, `PRESENT`.
3. **Latest legacy scan** from `scans` + `vulnerabilities_threat`
   - Reads `vt_code` from the joined `vulnerability_threat_details` row.
   - Adds the code only when `vt_status` is considered active (same status rules).

Lookup failures are **non-fatal** (they log warnings and keep going with any other sources).

## Tipset hashing (freshness / drift detection)

Hash function: `computePortalTipsetHash()` in `backend/utils/portalTipResolver.js`

- The hash is computed over a **canonical JSON representation** of the *final* tips array (after normalization and sorting).
- Hash is **deterministic** and stable across ordering differences.

### Where the hash is used

- **Admin state** freshness:
  - `GET /api/device/network/:networkId/state` computes `portal_out_of_date` based on:
    - `portal_last_patched_version < risk_score_version` **or**
    - `desiredTipsetHash !== networks.portal_tipset_hash`
  - Implemented in `backend/routes/deviceMgmtRoutes.js`.

- **Auto repatch even when risk didn’t change**:
  - `backend/utils/riskPipeline.js` recomputes the desired tipset hash during scan/threat updates.
  - If the tipset hash drifted, it triggers a **full advisory portal patch** (tips + security), even if bucket/score are unchanged.

## Portal patching + stamping

### Full advisory patch (tips + security)

- Builder: `buildPortalPayloadFromDB()` in `backend/controllers/captivePortalController.js`
  - Resolves final tips via `resolveFinalPortalTipsForNetwork()`.
  - Sends them to the Pi as `patch.portal_content.tips.items`.

- Auto trigger + stamping:
  - `autoPortalAdvisoryPatch()` in `backend/utils/riskPipeline.js`
  - On success, stamps:
    - `portal_last_patched_at`
    - `portal_last_patched_version`
    - `portal_tipset_hash`

### Other stamping locations

- AP enable flows stamp `portal_tipset_hash` after successful `portal/patch` during init/post-enable.
  - See the enable paths + `finalizeJob()` in `backend/routes/deviceMgmtRoutes.js`.

- Manual portal update endpoint stamps `portal_tipset_hash` when the request includes tips.
  - `POST /api/device/portal/update` in `backend/routes/deviceMgmtRoutes.js`.

### Cooldown

Auto portal patching is cooldown-limited by `PORTAL_PATCH_COOLDOWN_MS` (default `15000`).
See `backend/utils/riskPipeline.js`.

## Enabling / deploying

1. Apply migration SQL:
   - `backend/migrations/003_portal_tips_and_freshness.sql`

2. Seed the `portal_tips` table (manual, one-time):
   - `backend/seeds/portal_tips_seed.sql`

If `portal_tips` is not present or is empty, the resolver falls back to legacy `captive_portal_tips` and then hardcoded defaults.

## Tests

- Resolver behavior + hashing:
  - `backend/__tests__/unit/portalTipResolver.test.js`

- “Repatch when tipset changes” behavior:
  - `backend/__tests__/unit/riskPipeline.portalTipset.test.js`

Run backend tests from `backend/`:

```bash
npm test
```
