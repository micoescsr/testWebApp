-- Seed data: portal_tips
--
-- This file is intentionally NOT a migration.
-- Run manually in Supabase SQL Editor when you are ready to enable
-- conditional, system-generated captive-portal tips.
--
-- Notes:
-- - User-facing text is intentionally simplified (non-technical).
-- - Keep tip_text <= 300 chars (portal patch validator constraint).

INSERT INTO public.portal_tips (detection_code, tip_category, tip_text, source_ref, sort_order, is_active)
VALUES
  -- ── Baseline (fallback) tips ─────────────────────────────────────────────
  (NULL, 'baseline', 'Use a VPN when possible, especially on shared Wi‑Fi.', 'baseline', 10, true),
  (NULL, 'baseline', 'Avoid entering passwords, payment details, or other sensitive information on shared Wi‑Fi.', 'baseline', 20, true),
  (NULL, 'baseline', 'Keep your device and apps up to date for the latest security fixes.', 'baseline', 30, true),
  (NULL, 'baseline', 'If a login page or connection prompt looks unusual, disconnect and try again later.', 'baseline', 40, true),

  -- ── Detection-specific tips (WFVT mappings) ─────────────────────────────
  ('WFVT-001', 'specific', 'This Wi‑Fi may not require a password. Consider avoiding sensitive activity and using cellular data or a VPN.', 'WFVT-001', 10, true),
  ('WFVT-002', 'specific', 'This Wi‑Fi may be using outdated security settings. For sensitive tasks, prefer cellular data or a trusted hotspot.', 'WFVT-002', 20, true),
  ('WFVT-003', 'specific', 'A quick-connect feature is enabled, which can make it easier for others to connect. If you manage this Wi‑Fi, consider disabling it.', 'WFVT-003', 30, true),
  ('WFVT-004', 'specific', 'Some protections that help keep connections stable may be turned off. If the connection keeps dropping, avoid sensitive activity.', 'WFVT-004', 40, true),
  ('WFVT-005', 'specific', 'Confirm you are joining the official network name. Look‑alike hotspots can be set up nearby.', 'WFVT-005', 50, true),
  ('WFVT-006', 'specific', 'If you are repeatedly disconnected or asked to reconnect, pause and verify you are on the right network before continuing.', 'WFVT-006', 60, true),
  ('WFVT-007', 'specific', 'If you manage this network, review connected devices regularly and remove anything you do not recognize.', 'WFVT-007', 70, true)
;
