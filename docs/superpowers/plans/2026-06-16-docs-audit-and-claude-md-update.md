# Documentation Audit & CLAUDE.md Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all identified stale/incorrect MD files and wire key context docs into CLAUDE.md so future Claude sessions have accurate, complete project context.

**Architecture:** Documentation-only changes. No source code modified. Five independent change groups: posture fix, CAPSTONE corrections, CLAUDE.md routing, stale-file archival, PROJECT_CONTEXT verification.

**Tech Stack:** Markdown, git

---

## Assumptions & Constraints

- Security posture is **9/10** per `docs/feature-notes/SECURITY_HARDENING_PLAN.md` (dated 2026-03-08, phases 0–6 complete after C1-C12 fixes). README.md line 143 says 8/10 — that is wrong.
- `bucketize()` in `backend/utils/riskPipeline.js` maps score 0 → LOW (no "None" bucket in code). CAPSTONE shows "None: 0%" — this conflicts with implementation. Verify against UI before correcting CAPSTONE.
- noisy-OR formula lives in Supabase RPC `compute_scan_risk` (SQL, deployed per CHANGES_README migration 004). `backend/utils/scoring.js#computeRiskScore` is a separate local weighted-sum utility used for a different purpose. Both coexist.
- Table count: CAPSTONE says "16 primary tables" but lists 21 rows in the table — clear typo, fix to 21.
- `docs/PROJECT_CONTEXT_AND_PRD.md` dependency versions match current `package.json` — no version changes needed.

---

## Files to Modify

| File | Change |
|------|--------|
| `README.md` | Line 143: 8/10 → 9/10 |
| `docs/feature-notes/PRD_STATUS.md` | Posture claim: 8/10 → 9/10 |
| `docs/CAPSTONE_DOCUMENTATION.md` | Table count fix (16→21); "None" band annotation; scoring formula note |
| `docs/PROJECT_CONTEXT_AND_PRD.md` | Add note on noisy-OR scoring location; add MFA plan reference |
| `.claude/CLAUDE.md` | Add `@docs` section with 6 new doc references |

## Files to Archive (add deprecation header, not delete)

| File | Reason |
|------|--------|
| `docs/wifi_risk_scoring_review.md` | Proposal superseded by implemented noisy-OR spec |
| `ZAP-Security-Report.md` | Pre-remediation baseline; all 3 findings fixed |
| `reports/security_testing_results.md` | Pre-remediation baseline; post-remediation files supersede |

---

## Task 1: Fix Security Posture Claim in README.md

**Files:**
- Modify: `README.md:143`

- [ ] **Step 1: Verify the line number**

Run:
```bash
grep -n "8/10\|9/10\|posture\|Security Posture" README.md
```
Expected: line ~143 shows `### Current Security Posture: 8/10`

- [ ] **Step 2: Apply fix**

Find:
```markdown
### Current Security Posture: 8/10
```

Replace with:
```markdown
### Current Security Posture: 9/10
```

- [ ] **Step 3: Verify**
```bash
grep -n "posture\|8/10\|9/10" README.md
```
Expected: only 9/10 appears for the posture line.

- [ ] **Step 4: Commit**
```bash
git add README.md
git commit -m "docs: update security posture from 8/10 to 9/10 (phases 0-6 complete)"
```

---

## Task 2: Fix Security Posture Claim in PRD_STATUS.md

**Files:**
- Modify: `docs/feature-notes/PRD_STATUS.md`

- [ ] **Step 1: Locate the posture claim**
```bash
grep -n "8/10\|9/10\|posture" docs/feature-notes/PRD_STATUS.md
```

- [ ] **Step 2: Apply fix**

Find every instance of `8/10` referring to security posture and change to `9/10`.

- [ ] **Step 3: Verify no remaining stale 8/10 references**
```bash
grep -n "8/10" docs/feature-notes/PRD_STATUS.md
```
Expected: 0 matches (or only non-posture references).

- [ ] **Step 4: Commit**
```bash
git add docs/feature-notes/PRD_STATUS.md
git commit -m "docs: update PRD_STATUS posture from 8/10 to 9/10"
```

---

## Task 3: Fix CAPSTONE_DOCUMENTATION.md Errors

**Files:**
- Modify: `docs/CAPSTONE_DOCUMENTATION.md`

Three distinct fixes in this file.

### Fix A — Table count typo (16 → 21)

- [ ] **Step 1: Confirm count**

Run:
```bash
grep -n "16 primary\|primary tables" docs/CAPSTONE_DOCUMENTATION.md
```
Expected: `## 5. Database Schema` section says "16 primary tables".

Count the actual table rows listed:
```bash
grep -c "^\| \`" docs/CAPSTONE_DOCUMENTATION.md
```
(Count lines starting with `| \``) — should be ~21.

- [ ] **Step 2: Apply fix**

Find:
```markdown
The system uses 16 primary tables in PostgreSQL (Supabase):
```
Replace with:
```markdown
The system uses 21 primary tables in PostgreSQL (Supabase):
```

### Fix B — "None" band vs `bucketize()` discrepancy

- [ ] **Step 3: Verify `bucketize()` behavior for score 0**

Open `backend/utils/riskPipeline.js` lines 33-40. Confirm:
- `bucketize(0)` returns `'LOW'`
- There is no `'NONE'` bucket in the function

- [ ] **Step 4: Verify the UI display**

Search for "None" in frontend scoring/display code:
```bash
grep -rn "None\|NONE\|none" src/ --include="*.jsx" --include="*.js" | grep -i "risk\|bucket\|band\|score" | head -20
```

If the UI shows "None" for 0%: the CAPSTONE band is a UI display label only, not a backend bucket. Add a clarifying footnote.

If the UI does NOT show "None" for 0%: remove the "None" band row from the CAPSTONE table and update the note.

- [ ] **Step 5: Apply correction based on Step 4 finding**

**If UI shows "None" label for 0%** — add a footnote after the risk bands table:
```markdown
> **Note:** The "None" band (0%) is a UI display label only. The backend `bucketize()` function maps scores of 0 to `LOW`. The "None" label is surfaced at the presentation layer when no vulnerabilities are present.
```

**If UI does NOT show "None"** — remove the None row from the table:
```markdown
| Band | Range | UI Color |
|------|-------|----------|
| Low | 0–39% | Orange `#ff9800` |
| Medium | 40–69% | Yellow `#fbc02d` |
| High | 70–89% | Dark orange `#f57c00` |
| Critical | 90–100% | Red `#d32f2f` |
```

### Fix C — Scoring formula note (noisy-OR location)

- [ ] **Step 6: Add scoring formula clarification**

In Section 8 (Risk Scoring Model), after the Scoring Methodology table, add:

```markdown
> **Implementation note:** The 0–100 risk percentage is computed by the Supabase RPC `compute_scan_risk` using a noisy-OR formula: `(1 - Π(1 - CVSSᵢ/10)) × 100`. This is a SQL function (migration 004). The backend utility `utils/scoring.js#computeRiskScore` is a separate weighted-sum helper used for local/interim calculations and does not replace the RPC. The `bucketize()` function in `utils/riskPipeline.js` maps the RPC output to LOW/MEDIUM/HIGH/CRITICAL.
```

- [ ] **Step 7: Verify all three fixes applied**
```bash
grep -n "21 primary\|None.*band\|noisy-OR\|bucketize" docs/CAPSTONE_DOCUMENTATION.md
```
Expected: at least 2 matches (table count fix + formula note).

- [ ] **Step 8: Commit**
```bash
git add docs/CAPSTONE_DOCUMENTATION.md
git commit -m "docs: fix CAPSTONE table count (16→21), clarify risk bands and scoring formula"
```

---

## Task 4: Update PROJECT_CONTEXT_AND_PRD.md

**Files:**
- Modify: `docs/PROJECT_CONTEXT_AND_PRD.md`

Two additions only — no version changes needed (versions verified against package.json).

- [ ] **Step 1: Add noisy-OR scoring note**

In Section 8 (Security Overview) or at end of Section 2 (Tech Stack), add a row or note:
```markdown
| Risk Scoring | Supabase RPC `compute_scan_risk` (noisy-OR, migration 004) + `bucketize()` JS layer |
```

Or as a callout under the security overview table:
```markdown
> **Scoring:** `compute_scan_risk` RPC applies noisy-OR: `(1 - Π(1 - CVSSᵢ/10)) × 100`, bucketized by `utils/riskPipeline.js#bucketize()`.
```

- [ ] **Step 2: Add MFA plan reference**

In Section 9 (Recommended Reading Order) or in the Documentation Index table at top, add:
```markdown
| 13 | [MFA_AUTHENTICATION_PLAN.md](./MFA_AUTHENTICATION_PLAN.md) | Planned TOTP-based MFA (not yet implemented) |
```

- [ ] **Step 3: Verify**
```bash
grep -n "noisy-OR\|MFA" docs/PROJECT_CONTEXT_AND_PRD.md
```
Expected: 2 matches.

- [ ] **Step 4: Commit**
```bash
git add docs/PROJECT_CONTEXT_AND_PRD.md
git commit -m "docs: add noisy-OR scoring note and MFA plan reference to PROJECT_CONTEXT"
```

---

## Task 5: Add Key Doc References to CLAUDE.md

**Files:**
- Modify: `.claude/CLAUDE.md`

Currently CLAUDE.md references:
- `docs/SECURITY_AND_RISKS.md` ✓
- `docs/feature-notes/SECURITY_HARDENING_PLAN.md` ✓
- `docs/feature-notes/PI_SIGNING_README.md` ✓

Add these missing high-value references.

- [ ] **Step 1: Add a Documentation section to CLAUDE.md**

At the bottom of `.claude/CLAUDE.md`, add:

```markdown
## Key Documentation References

These docs contain context that is NOT derivable from the source code and SHOULD be consulted before working on their respective areas:

| Doc | When to Read |
|-----|-------------|
| `docs/API_CONTEXT.md` | Before adding/modifying API endpoints — single source of truth for all 60+ endpoints, data flow, and error codes |
| `docs/AUTHENTICATION_AND_AUTHORIZATION.md` | Before touching auth middleware, JWT flows, cookie config, or RBAC |
| `docs/scoring-refactor/WIFI_RISK_SCORE_SPEC.md` | Before any scoring changes — defines the noisy-OR formula (implemented in Supabase RPC `compute_scan_risk`) |
| `docs/feature-notes/CHANGES_README.md` | Before starting any task — check what changed recently to avoid re-implementing or conflicting with recent work |
| `backend/TESTING.md` | Before writing backend tests — covers test strategy, mock patterns, coverage thresholds |
| `docs/feature-notes/ASYNC_AP_README.md` | Before modifying AP toggle or device management — async job cascade pattern documented here |
| `docs/MFA_AUTHENTICATION_PLAN.md` | Before modifying auth flows — TOTP MFA is planned; don't design new auth features that conflict |

Also see (already noted above in Security context):
- `docs/SECURITY_AND_RISKS.md`
- `docs/feature-notes/SECURITY_HARDENING_PLAN.md`
- `docs/feature-notes/PI_SIGNING_README.md`
```

- [ ] **Step 2: Verify the section was added**
```bash
grep -n "API_CONTEXT\|ASYNC_AP\|WIFI_RISK_SCORE_SPEC\|MFA_AUTHENTICATION" .claude/CLAUDE.md
```
Expected: 4 matches.

- [ ] **Step 3: Commit**
```bash
git add .claude/CLAUDE.md
git commit -m "docs: add key documentation references section to CLAUDE.md"
```

---

## Task 6: Mark Stale Files as Deprecated

**Files:**
- Modify: `docs/wifi_risk_scoring_review.md` (add header)
- Modify: `ZAP-Security-Report.md` (add header)
- Modify: `reports/security_testing_results.md` (add header)

Do NOT delete — these are historical records useful for audit trail. Add a deprecation notice at the top of each.

- [ ] **Step 1: Add deprecation header to `docs/wifi_risk_scoring_review.md`**

Prepend to the file:
```markdown
> ⚠️ **SUPERSEDED** — This document was a proposal for the noisy-OR risk formula. The formula is now implemented. See `docs/scoring-refactor/WIFI_RISK_SCORE_SPEC.md` for the canonical specification and `backend/utils/riskPipeline.js#bucketize` + Supabase RPC `compute_scan_risk` for the implementation. This file is retained as a historical record only.

---

```

- [ ] **Step 2: Add deprecation header to `ZAP-Security-Report.md`**

Prepend:
```markdown
> ⚠️ **HISTORICAL** — This is the pre-remediation OWASP ZAP baseline scan (all 3 critical findings: CSP, X-Frame-Options, X-Content-Type-Options). All findings have been remediated in security hardening phases 1-C. See `docs/feature-notes/SECURITY_HEADERS_FRONTEND.md` and `reports/security_testing_results_post_remediation.md` for the current state.

---

```

- [ ] **Step 3: Add deprecation header to `reports/security_testing_results.md`**

Prepend:
```markdown
> ⚠️ **HISTORICAL** — Pre-remediation security test results. Superseded by `reports/security_testing_results_post_remediation.md` and `reports/security_testing_results_rerun.md`. Retained for audit trail only.

---

```

- [ ] **Step 4: Verify all three headers added**
```bash
grep -l "SUPERSEDED\|HISTORICAL" docs/wifi_risk_scoring_review.md ZAP-Security-Report.md reports/security_testing_results.md
```
Expected: 3 files listed.

- [ ] **Step 5: Commit**
```bash
git add docs/wifi_risk_scoring_review.md ZAP-Security-Report.md reports/security_testing_results.md
git commit -m "docs: mark pre-remediation and superseded docs as historical"
```

---

## Self-Review

### Spec Coverage

| Issue | Task |
|-------|------|
| README posture 8/10 → 9/10 | Task 1 ✓ |
| PRD_STATUS posture 8/10 → 9/10 | Task 2 ✓ |
| CAPSTONE table count 16 → 21 | Task 3A ✓ |
| CAPSTONE "None" band vs bucketize conflict | Task 3B ✓ |
| CAPSTONE scoring formula explanation | Task 3C ✓ |
| PROJECT_CONTEXT noisy-OR and MFA | Task 4 ✓ |
| CLAUDE.md missing doc references | Task 5 ✓ |
| Stale pre-remediation files unmarked | Task 6 ✓ |

### Placeholder Scan

No TBD/TODO items left. All steps include exact file paths, exact strings to find/replace, exact verification commands.

### Consistency Check

- "9/10" posture used consistently in Task 1, 2, and CAPSTONE (Task 3 does not change the phase table — the ⚠️ on phases 3 and 4 in CAPSTONE section 7.2 reflects residual issues, which is accurate per `SECURITY_HARDENING_PLAN.md` watchlist; leave those ⚠️ as-is).
- `bucketize()` thresholds (0-39 LOW, 40-69 MEDIUM, 70-89 HIGH, 90-100 CRITICAL) are referenced consistently in Task 3B and 3C.
- noisy-OR is credited to the Supabase RPC `compute_scan_risk` in both Task 3C and Task 4 — consistent.
