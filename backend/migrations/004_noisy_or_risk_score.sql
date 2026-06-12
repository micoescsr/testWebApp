-- =============================================================================
-- WIFI RISK SCORE — NOISY-OR FORMULA — SQL MIGRATION
-- =============================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--
-- Replaces the SQL body of public.compute_scan_risk(p_scan_id bigint) per
-- docs/scoring-refactor/WIFI_RISK_SCORE_SPEC.md.
--
-- Old formula:  Score% = ( Σ Pi × CVSSi ) / Rmax × 100   (Rmax = 60.7, fixed)
-- New formula:  Score% = ( 1 − Π (1 − CVSSi/10) ) × 100  over all observed Pi=1
--
-- Scope selection is UNCHANGED from the existing function:
--   - Fixed dataset of 7 items (WFVT-001..WFVT-007)
--   - Vulnerability rows (vt_kind='VULNERABILITY'): present if row exists
--   - Threat rows (vt_kind='THREAT'): present only if latest vt_status='ACTIVE'
--
-- Worked examples (see spec Section 3):
--   none                                    → 0%
--   Open Auth (9.4) only                    → 1-(1-0.94)            = 94%
--   Open Auth + Evil Twin + Deauth          → 1-(0.06×0.07×0.15)    ≈ 99.94% → 100
--   + PMF Disabled (7.1)                    → 1-(0.06×0.07×0.15×0.29) ≈ 99.98% → 100
--
-- Function signature, return type (integer), and all callers are unchanged:
--   compute_scan_risk(p_scan_id bigint) returns integer
--
-- SAFE TO RE-RUN: CREATE OR REPLACE.
-- NOTE: if the existing function was declared SECURITY DEFINER, re-add that
-- clause below — CREATE OR REPLACE does not preserve unspecified attributes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_scan_risk(p_scan_id bigint)
RETURNS integer AS $$
declare
  scope_codes constant text[] := array[
    'WFVT-001',
    'WFVT-002',
    'WFVT-003',
    'WFVT-004',
    'WFVT-005',
    'WFVT-006',
    'WFVT-007'
  ];
  has_full_cvss boolean := false;
  log_sum numeric := 0;
  product numeric := 1;
  pct numeric := 0;
  score_int integer := 0;
begin
  -- Observed set: same scope + presence rules as before, but we no longer
  -- need Rmax — only the CVSS values of items that are "present" (Pi = 1).
  with scope as (
    select vt_detail_id, vt_code, vt_kind, vt_cvss_base_score
    from public.vulnerability_threat_details
    where vt_code = any(scope_codes)
  ),
  latest_state as (
    -- pick the latest row per vt_detail_id for this scan
    select distinct on (vt.vt_detail_id)
      vt.vt_detail_id,
      vt.vt_status
    from public.vulnerabilities_threat vt
    join scope s
      on s.vt_detail_id = vt.vt_detail_id
    where vt.scan_id = p_scan_id
    order by vt.vt_detail_id, vt.created_at desc
  ),
  observed as (
    select s.vt_cvss_base_score as cvss
    from latest_state ls
    join scope s
      on s.vt_detail_id = ls.vt_detail_id
    where
      upper(s.vt_kind) = 'VULNERABILITY'
      or (
        upper(s.vt_kind) = 'THREAT'
        and upper(coalesce(ls.vt_status, '')) = 'ACTIVE'
      )
  )
  -- Π(1 - CVSSi/10) via exp(Σ ln(1 - CVSSi/10)); a CVSS of exactly 10 would
  -- make a factor 0 (ln(0) undefined), so short-circuit the product to 0
  -- whenever any observed item has CVSS >= 10.
  select
    coalesce(bool_or(cvss >= 10), false),
    coalesce(sum(ln(1 - (cvss / 10))) filter (where cvss < 10), 0)
    into has_full_cvss, log_sum
  from observed;

  if has_full_cvss then
    product := 0;
  else
    product := exp(log_sum);
  end if;

  pct := (1 - product) * 100;

  -- clamp 0..100 then round
  if pct < 0 then pct := 0; end if;
  if pct > 100 then pct := 100; end if;

  score_int := round(pct)::int;

  update public.scans
  set risk_score = score_int
  where scan_id = p_scan_id;

  return score_int;
end;
$$ LANGUAGE plpgsql;
