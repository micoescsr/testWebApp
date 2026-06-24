# Handoff — Conditional Recommendation Mapping + Report Source Links

**Branch:** `mico-testing-branch` · **Status:** complete, committed, not merged · **Date:** 2026-06-24

## What this work delivered

Single source of truth for WFVT finding → recommendation mapping, wired into **both** the
finding modal and the exported reports (overall + per-network), with clickable
NIST/ITL standard source links.

### Source of truth
- `src/data/recommendationMap.cjs` — WFVT-001..004 (vulnerabilities) + reverse threat
  mapping for WFVT-005/006/007. Exports `SOURCES`, `RECOMMENDATION_MAP`,
  `getRecommendationsForThreat`, `resolveSourceObjects`.
- **`.cjs` extension is deliberate:** root `package.json` is `"type": "module"`, so a `.js`
  with `module.exports` would be parsed as ESM and export nothing. `.cjs` loads in both the
  Express backend (`require`) and Vite/ESM frontend (`import`). Do not rename to `.js`.

### Modal side (done in prior session)
- `backend/controllers/samController.js` — `buildRecommendations(vtCode, kind)` replaced
  generic `defaultRecommendations()` `{nist,owasp}`. Returns array of rich rec objects.
- `src/hooks/useSAM.js` — recommendations default `{nist,owasp}` → `[]`.
- `FindingDetailModal.jsx`/`.css` — accordion cards with clickable source badges; rendered in
  both vuln and threat bodies. Uses existing `fdm-*` design tokens.

### Report side (this session)
- `backend/utils/reportAggregations.js` — removed `REMEDIATION_CATALOG`; rewrote
  `buildRemediationPlan()` to derive from the map. `detailedMapping` rows carry
  `source` + `sourceUrls`. Conditional on detected codes; deduped by text.
- `src/utils/reportDataAdapter.js` — per-network adapter now populates
  `recommendations.{immediate,shortTerm}` and `findingDetails` (were empty before).
- `src/utils/reportTemplates.js` — `renderSourceLinks()` helper; overall report has a
  **Source** column; per-network recs render clickable links.
- `backend/__tests__/unit/reportAggregations.test.js` — updated for map-derived output.
- `docs/feature-notes/CHANGES_README.md` — glossary updated.

## Expected behavior (recommendation counts)
- WFVT-001 → 2 recs (NIST SP 800-97)
- WFVT-004 → 3 recs (NIST 800-97, ITL Bulletin, NIST 800-153)
- WFVT-005 Evil Twin threat → 4 reverse-mapped recs
- WFVT-006 Deauth → 2 · WFVT-007 MAC Spoofing → 3
- Reports show ONLY recommendations for detected findings.

## Verification done
- `cd backend && npx jest __tests__/unit/reportAggregations.test.js` → 44 passed.
- `npx vite build` → passes (confirms `.cjs` ESM import).
- grep: no live code on `recommendations.nist|owasp`, `defaultRecommendations`, `REMEDIATION_CATALOG`.
- Node render check: `<a href="https://csrc.nist.gov...` present in both overall + per-network HTML.

## NOT done / pick up here
- **Live manual check pending** (needs Supabase + Pi env): export Summary + Per-Network from a
  session with real detected WFVT findings; confirm links open and only detected findings show.
- **PDF link clickability:** anchors + href survive the `window.open`+`print()` path; whether the
  saved PDF keeps links *clickable* depends on the browser PDF engine (Chromium preserves them).
  Text+URL always survive. Only revisit if a true PDF lib is wanted.
- **Side effect to eyeball:** `data.remediation` also feeds any live Dashboard remediation UI —
  wording now comes from the map (more verbose, with sources).
- **Not merged.** Branch `mico-testing-branch`. No PR opened.

## Stale/untracked (intentionally not committed)
- `implementation_plan_report-recomm.md` — original plan; **stale** (its Phase 2 + modal redesign
  were already shipped before this work). Kept untracked for reference only.
- `why_pi_dashboard_ui_fix_prompt.md`, `.claude/worktrees/` — unrelated.

## Resume commands
```bash
git checkout mico-testing-branch
cd backend && npx jest __tests__/unit/reportAggregations.test.js
cd .. && npx vite build
```
