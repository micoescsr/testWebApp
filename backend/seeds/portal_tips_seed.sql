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
/*   -- ── Baseline (fallback) tips ─────────────────────────────────────────────
  (NULL, 'baseline', 'Use a VPN when possible, especially on shared Wi‑Fi.', 'baseline', 10, true),
  (NULL, 'baseline', 'Avoid entering passwords, payment details, or other sensitive information on shared Wi‑Fi.', 'baseline', 20, true),
  (NULL, 'baseline', 'Keep your device and apps up to date for the latest security fixes.', 'baseline', 30, true),
  (NULL, 'baseline', 'If a login page or connection prompt looks unusual, disconnect and try again later.', 'baseline', 40, true), */

-- PHAULA CODE TO BE INSERTED MAR 17 - 11:30 AM
INSERT INTO public.portal_tips (detection_code, tip_category, tip_text, source_ref, sort_order, is_active) VALUES
  (NULL, 'baseline', 'Use a VPN when possible, especially on shared Wi‑Fi.', 'baseline', 10, true),
  (NULL, 'baseline', 'Avoid entering passwords, payment details, or other sensitive information on shared Wi‑Fi.', 'baseline', 20, true),
  (NULL, 'baseline', 'Connect only to networks that use WPA2 encryption or stronger.', 'baseline', 30, true),
  (NULL, 'baseline', 'If a login page or connection prompt looks unusual, disconnect and try again later.', 'baseline', 40, true),
  (NULL, 'baseline', 'Stay aware of your surroundings when entering passwords or viewing sensitive information.', 'baseline', 50, true),
  (NULL, 'baseline', 'Only enter personal information on secure websites that start with "https."', 'baseline', 60, true),
  (NULL, 'baseline', 'Log out of accounts after using them instead of staying signed in.', 'baseline', 70, true);


  -- ── Detection-specific tips (WFVT mappings) ─────────────────────────────
  ('WFVT-001', 'specific', 'Avoid connecting to untrusted or unknown Wi-Fi networks.', 'WFVT-001', 10, true),
  ('WFVT-001', 'specific', 'Avoid performing financial transactions on public Wi-Fi.', 'WFVT-001', 11, true),
  ('WFVT-001', 'specific', 'Avoid public Wi-Fi for banking or sensitive services.', 'WFVT-001', 12, true),
  ('WFVT-001', 'specific', 'Use a Virtual Private Network (VPN) when possible.', 'WFVT-001', 13, true),
  ('WFVT-001', 'specific', 'Use encrypted networks over open ones.', 'WFVT-001', 14, true),
  ('WFVT-002', 'specific', 'Keep your devices and software updated.', 'WFVT-002', 20, true),
  ('WFVT-002', 'specific', 'Use multi-factor authentication for online accounts.', 'WFVT-002', 21, true),
  ('WFVT-003', 'specific', 'Turn off Wi-Fi and wireless features when unused.', 'WFVT-003', 30, true),
  ('WFVT-004', 'specific', 'Log out of accounts after using them on public networks.', 'WFVT-004', 40, true),
  ('WFVT-005', 'specific', 'Check the Wi-Fi network name before you connect.', 'WFVT-005', 50, true),
  ('WFVT-005', 'specific', 'Be cautious with Wi-Fi networks that seem suspicious or similar in name.', 'WFVT-005', 51, true),
  ('WFVT-005', 'specific', 'Check if websites use HTTPS before entering personal information.', 'WFVT-005', 52, true),
  ('WFVT-005', 'specific', 'Avoid suspicious networks labeled “Free Wi-Fi”.', 'WFVT-005', 53, true),
  ('WFVT-005', 'specific', 'Use VPN if public Wi-Fi cannot be avoided.', 'WFVT-005', 54, true),
  ('WFVT-006', 'specific', 'Disconnect from Wi-Fi when not in use.', 'WFVT-006', 60, true),
  ('WFVT-007', 'specific', 'Turn off automatic Wi-Fi connections on your device.', 'WFVT-007', 70, true),
  ('WFVT-007', 'specific', 'Disable file sharing when using public Wi-Fi.', 'WFVT-007', 71, true)
;

