# WiFi Risk Score — Noisy-OR Formula Spec

> Status: **Implemented** — SQL body of `compute_scan_risk` replaced with the
> noisy-OR formula in `backend/migrations/004_noisy_or_risk_score.sql`. Run
> that migration in the Supabase SQL Editor to apply.
> See `docs/scoring-refactor/README.md` for the existing scoring architecture
> this proposal builds on.

## 1. Current Formula & Problem

`compute_scan_risk(p_scan_id)` (Supabase RPC, sole writer of `scans.risk_score`
per the scoring-refactor README) currently computes:

```
Score% = ( Σ Pi × CVSSi ) / Rmax × 100
```

- `Pi ∈ {0,1}` — presence indicator for finding `i` (1 if `vt_status='ACTIVE'`)
- `CVSSi` — CVSS Base Score for finding `i` (from `vulnerability_threat_details.vt_cvss_base_score`)
- `Rmax = 60.7` — fixed sum of all 7 WFVT item CVSS scores (constant for the dataset)

`riskPipeline.bucketize()` (`backend/utils/riskPipeline.js:33`) maps the 0-100
result to `LOW / MEDIUM / HIGH / CRITICAL` using the official 0/1-39/40-69/70-89/90-100
scale.

### The dilemma (`wifi_risk_scoring_review.md`)

A network with **only** "Open System Authentication" detected (CVSS 9.4):

```
Score% = 9.4 / 60.7 × 100 = 15.49%  →  LOW bucket
```

But Open Auth is independently rated **Critical** (CVSS 9.0-10.0). A user
viewing "15% / Low" on the captive portal will assume the network is
relatively safe, despite a Critical vulnerability being present. The fixed
`Rmax` denominator dilutes any single severe finding.

A secondary issue with a naive "use max CVSS instead" fix (Option B in the
review doc): two networks — one with only Open Auth, another with Open Auth +
Evil Twin + Deauthentication + PMF Disabled — would both score `94%`,
ignoring that the second network has strictly more exposure.

## 2. New Formula — Noisy-OR / Probabilistic Combination

```
Score% = ( 1 − Π (1 − CVSSi/10) ) × 100      for all i where Pi = 1 (ACTIVE)
```

Each `CVSSi/10` is treated as the severity-weighted likelihood that finding
`i` alone leads to compromise. The product `Π(1 − CVSSi/10)` is the
probability that **none** of the active findings lead to compromise; its
complement is the probability that **at least one** does.

Properties:
- Bounded in `[0, 100)` naturally — no `Rmax` constant needed.
- Monotonically increasing as more findings become ACTIVE.
- A single high-severity finding immediately produces a high score.
- Multiple findings compound toward 100% rather than plateauing.
- If no findings are ACTIVE → `Π` over empty set `= 1` → `Score% = 0`.

## 3. Worked Examples

Using the PDF's WFVT CVSS values (Open Auth 9.4, Evil Twin 9.3, Deauth 8.5,
PMF Disabled 7.1):

| Detected findings | Old formula (`/60.7`) | New formula (noisy-OR) |
|---|---|---|
| none | 0% | 0% |
| Open Auth (9.4) only | `9.4/60.7 = 15.49%` → **LOW** | `1-(1-0.94) = 94%` → **CRITICAL** |
| Open Auth + Evil Twin + Deauth (9.4, 9.3, 8.5) | `27.2/60.7 = 44.81%` → **MEDIUM** | `1-(0.06×0.07×0.15) = 99.94%` → **CRITICAL** |
| Open Auth + Evil Twin + Deauth + PMF (9.4, 9.3, 8.5, 7.1) | `34.3/60.7 = 56.51%` → **MEDIUM** | `1-(0.06×0.07×0.15×0.29) ≈ 99.98%` → **CRITICAL** |

Note rows 2 and 3/4 are no longer collapsed under the old "max-CVSS-only"
alternative (which would give all of rows 2-4 the same `94%`) — the noisy-OR
result for rows 3-4 is distinguishably higher than row 2.

## 4. Academic / Standards Justification

### CVSS v4.0 (FIRST)
> "The Base Score reflects the severity of a vulnerability according to its
> intrinsic characteristics which are constant over time."

Per-item `CVSSi` values are **unchanged** — still the intrinsic Base Score
from `vulnerability_threat_details`. The noisy-OR change only affects how
multiple already-scored items are **combined** into one network-level number.

The CVSS specification does not define a multi-vulnerability aggregation
method — combining scores across findings for a single asset is explicitly
left to the implementer/organization. Choosing a different combination
function is therefore a scope-appropriate design decision, not a deviation
from CVSS — unlike modifying individual `CVSSi` values would be.

### NIST SP 800-30 Rev. 1
NIST's risk-aggregation guidance holds that risk from multiple
threat/vulnerability pairs affecting the same asset is **not** simple
addition — aggregated risk can exceed any individual contributing risk and
reflects compounding exposure. This directly supports moving away from the
linear `Σ/Rmax` normalization (which can *understate* a single severe
finding) toward a combination function that compounds: noisy-OR grows toward
100% as more high-severity findings accumulate, and never falls below the
contribution of the single worst finding.

Likelihood-as-presence (`Pi ∈ {0,1}`, evidence-based — "risk assessors assign
a score based on available evidence") is unchanged from the current model.

### OWASP Risk Rating Methodology
`Risk = Likelihood × Impact` — the per-item `Pi × CVSSi` relationship is
unchanged. OWASP's threat-modeling principle that an attacker needs only
**one** successful exploit path to compromise a system maps directly onto
"at least one of these N findings is exploited" — exactly what
`1 - Π(1-CVSSi/10)` expresses: the probability that at least one of N
independent severity-weighted exposures is realized.

### Probability theory / reliability engineering
`1 - Π(1-pi)` is the standard formula for the probability of a union of
independent events, and the "OR-gate" combination rule in Fault Tree Analysis
(FTA) — an established reliability-engineering technique for combining
multiple independent failure/exposure causes into one top-event probability.
This gives the formula a formal mathematical grounding, in contrast to the
somewhat arbitrary fixed-denominator (`/60.7`) normalization it replaces.

## 5. Severity / Bucket Table — Unchanged

Both formulas output a 0-100 value, so the existing classification table
(`riskPipeline.bucketize()`, `getRiskLabel()` in
`backend/controllers/rasPiController.js:8`) requires **no changes**:

| Score% | Bucket |
|---|---|
| 0 | LOW (None) |
| 1-39 | LOW |
| 40-69 | MEDIUM |
| 70-89 | HIGH |
| 90-100 | CRITICAL |

## 6. Continuous Detection Lifecycle — Recompute Points

The noisy-OR formula slots into the **existing** recompute points with no new
hooks or schema changes, because `compute_scan_risk` already recomputes from
the full `vt_status='ACTIVE'` set on every call (not incrementally):

```
1. Initial scan (saveNetworkMetadataScan)
   ├─ Insert 4 config-vuln rows into vulnerabilities_threat
   │  (vt_status='ACTIVE' if misconfiguration detected)
   └─ compute_scan_risk(scan_id)
        → "Initial WiFi Risk Score" = noisy-OR over ACTIVE config vulns only

2. Continuous detection poll cycle (detectController.poll → persistThreatRows)
   ├─ Upsert evil_twin / mac_spoofing / deauthentication rows
   │  (ACTIVE if DETECTED, INACTIVE if CLEARED)
   ├─ compute_scan_risk(scan_id)   [recomputed from scratch over ACTIVE set]
   │  → "Live WiFi Risk Score" = noisy-OR over ACTIVE (config vulns ∪ threats)
   └─ updateNetworkRisk(networkId, { newScore, newBucket })

3. Stop / heartbeat-fail (stopDetection / getStatusAndMaybeFail)
   └─ Final compute_scan_risk(scan_id) + updateNetworkRisk + scan_end stamp
```

Only the SQL body of `compute_scan_risk` changes; its signature
(`compute_scan_risk(p_scan_id bigint) returns numeric`) and every caller
(`persistThreatRows`, `stopDetection`, `getStatusAndMaybeFail`,
`saveNetworkMetadataScan`) stay the same.

## 7. Behavior Change to Flag: Score Can Decrease

Under noisy-OR, when an active threat clears (`vt_status` → `INACTIVE`), its
`(1 - CVSSi/10)` term drops out of the product, and the score can **decrease**
— not just increase. This is consistent with Phase 4 of the existing scoring
refactor (`updateNetworkRisk` already applies the real RPC score every poll,
not an elevate-only bucket) — so no pipeline behavior changes, but it should
be called out for anyone expecting the score to be monotonically increasing
during a detection session.

## 8. Open Question: CVSS Value Source Discrepancy

The PDF's WFVT table (Open Auth 9.4, Weak Crypto 9.4, WPS 7.6, PMF 7.1, Evil
Twin 9.3, Deauth 8.5, MAC Spoofing 9.4 — `Rmax=60.7`) does not match the
values currently in `backend/__tests__/fixtures/threatDefinitions.js` (9.1,
7.5, 8.1, 5.3, 8.6, 6.8, 7.2). The noisy-OR formula works regardless of the
exact `CVSSi` values, but the actual production values in Supabase
`vulnerability_threat_details.vt_cvss_base_score` should be confirmed before
implementation, since `Rmax` is no longer used (eliminating this discrepancy
as a scoring concern, but it's still worth reconciling the dataset values
themselves against the CVSS v4.0 vector strings on PDF page 7).

## 9. Implementation Notes

- SQL body of the `compute_scan_risk` RPC replaced via
  `backend/migrations/004_noisy_or_risk_score.sql` — `SUM(...)/60.7*100`
  → `1-PRODUCT(1-cvss/10)`, computed as `EXP(SUM(LN(1 - cvss/10)))` over
  observed rows (SQL has no native `PRODUCT()` aggregate). A CVSS of exactly
  10 is special-cased to force the product to 0 (avoids `ln(0)`).
- `bucketize()`, `getRiskLabel()`, `riskPipeline.js`, and all JS callers
  require **no changes** — output domain is still `[0,100]`, function
  signature/return type unchanged.
- Worked examples from Section 3 are included as comments in the migration
  file for verification after applying it against a test scan.
