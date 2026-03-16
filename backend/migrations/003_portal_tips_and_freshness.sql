-- Migration: Conditional captive-portal tips + portal freshness hash
-- Purpose:
--   1) Introduce a global, system-managed portal_tips mapping table that can
--      serve baseline tips and detection-specific tips.
--   2) Add networks.portal_tipset_hash to track portal freshness beyond
--      risk_score_version (tip content can change without a risk bump).
--
-- Safety:
--   - Additive only (no drops / no destructive changes)
--   - Safe to re-run (IF NOT EXISTS)
--   - Does NOT remove or alter legacy captive_portal_tips behavior

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) portal_tips mapping table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.portal_tips (
  tip_id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  detection_code text        NULL,
  tip_category   text        NOT NULL CHECK (tip_category = ANY (ARRAY['specific'::text, 'baseline'::text])),
  tip_text       text        NOT NULL,
  source_ref     text        NULL,
  sort_order     integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_tips_pkey PRIMARY KEY (tip_id)
);

COMMENT ON TABLE public.portal_tips IS
  'System-managed captive-portal tip templates. tip_category=baseline (general) or specific (detection_code-mapped).';

CREATE INDEX IF NOT EXISTS idx_portal_tips_active_category_sort
  ON public.portal_tips (tip_category, sort_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_portal_tips_active_detection_code
  ON public.portal_tips (detection_code)
  WHERE is_active = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) networks freshness hash
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.networks
ADD COLUMN IF NOT EXISTS portal_tipset_hash text NULL;
