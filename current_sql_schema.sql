-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.audit_logging (
  audit_log_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  actor_profile_id uuid NOT NULL,
  request_id uuid,
  actor_ip inet,
  user_agent text,
  event_name text NOT NULL,
  event_status USER-DEFINED NOT NULL,
  entity_type text NOT NULL,
  entity_id_uuid uuid,
  entity_id_bigint bigint,
  old_values jsonb,
  new_values jsonb,
  meta jsonb,
  CONSTRAINT audit_logging_pkey PRIMARY KEY (audit_log_id),
  CONSTRAINT audit_logging_actor_profile_id_fkey FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.audit_logs (
  audit_log_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  event_status text NOT NULL,
  entity_type text NOT NULL,
  entity_id bigint NOT NULL,
  old_values jsonb,
  new_values jsonb,
  profile_id uuid DEFAULT gen_random_uuid(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (audit_log_id),
  CONSTRAINT audit_logs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.captive_portal (
  captive_portal_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  announcement_id bigint,
  is_active boolean,
  tc_id bigint,
  network_id uuid,
  CONSTRAINT captive_portal_pkey PRIMARY KEY (captive_portal_id),
  CONSTRAINT captive_portal_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.captive_portal_announcements(announcement_id),
  CONSTRAINT captive_portal_tc_id_fkey FOREIGN KEY (tc_id) REFERENCES public.terms_conditions(tc_id),
  CONSTRAINT captive_portal_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id)
);
CREATE TABLE public.captive_portal_announcements (
  announcement_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  announcement_content text,
  is_active boolean,
  network_id uuid,
  CONSTRAINT captive_portal_announcements_pkey PRIMARY KEY (announcement_id),
  CONSTRAINT announcements_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id)
);
CREATE TABLE public.captive_portal_tips (
  tip_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  captive_portal_id bigint NOT NULL,
  tip_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT captive_portal_tips_pkey PRIMARY KEY (tip_id),
  CONSTRAINT captive_portal_tips_captive_portal_id_fkey FOREIGN KEY (captive_portal_id) REFERENCES public.captive_portal(captive_portal_id)
);
CREATE TABLE public.dashboard (
  dashboard_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  network_id uuid,
  CONSTRAINT dashboard_pkey PRIMARY KEY (dashboard_id),
  CONSTRAINT dashboard_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id)
);
CREATE TABLE public.network_memberships (
  membership_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  network_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  role_on_network text NOT NULL DEFAULT 'admin'::text CHECK (role_on_network = ANY (ARRAY['admin'::text, 'superadmin'::text])),
  assigned_by_profile_id uuid,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT network_memberships_pkey PRIMARY KEY (membership_id),
  CONSTRAINT network_memberships_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id),
  CONSTRAINT network_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT network_memberships_assigned_by_profile_id_fkey FOREIGN KEY (assigned_by_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.networks (
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ssid text,
  city text,
  province text,
  notes text,
  encryption_status text,
  num_clients integer,
  bssid text,
  channel integer CHECK (channel IS NULL OR channel >= 1 AND channel <= 14),
  network_id uuid NOT NULL DEFAULT gen_random_uuid(),
  portal_initialized boolean NOT NULL DEFAULT false,
  ap_enabled boolean NOT NULL DEFAULT false,
  risk_score integer NOT NULL DEFAULT 0,
  risk_bucket text NOT NULL DEFAULT 'LOW',
  risk_score_version bigint NOT NULL DEFAULT 0,
  portal_last_patched_version bigint NOT NULL DEFAULT 0,
  portal_last_patched_at timestamp with time zone,
  ap_last_applied_at timestamp with time zone,
  ap_apply_in_progress boolean NOT NULL DEFAULT false,
  last_threat_at timestamp with time zone,
  last_scan_id uuid,
  last_scan_finished_at timestamp with time zone,
  CONSTRAINT networks_pkey PRIMARY KEY (network_id),
  CONSTRAINT networks_risk_bucket_check CHECK (risk_bucket IN ('LOW','MEDIUM','HIGH','CRITICAL'))
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'admin'::text CHECK (role = ANY (ARRAY['admin'::text, 'superadmin'::text])),
  username character varying UNIQUE,
  last_login timestamp without time zone DEFAULT now(),
  status USER-DEFINED NOT NULL DEFAULT 'active'::status,
  must_change_password boolean NOT NULL DEFAULT false,
  temp_expires_at timestamp with time zone,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.raspAP_configuration (
  raspAP_config_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ap_enabled boolean,
  active_ap_ssid text,
  updated_at timestamp with time zone,
  network_id uuid,
  CONSTRAINT raspAP_configuration_pkey PRIMARY KEY (raspAP_config_id),
  CONSTRAINT raspAP_configuration_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id)
);
CREATE TABLE public.report (
  report_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_archived boolean,
  archived_at timestamp with time zone,
  profile_id uuid DEFAULT gen_random_uuid(),
  CONSTRAINT report_pkey PRIMARY KEY (report_id),
  CONSTRAINT report_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.scan_locks (
  network_id uuid NOT NULL,
  active_scan_id uuid,
  locked_by_profile_id uuid,
  locked_at timestamp with time zone NOT NULL DEFAULT now(),
  lock_expires_at timestamp with time zone NOT NULL,
  CONSTRAINT scan_locks_pkey PRIMARY KEY (network_id),
  CONSTRAINT scan_locks_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id),
  CONSTRAINT scan_locks_active_scan_id_fkey FOREIGN KEY (active_scan_id) REFERENCES public.vulnerability_scans(scan_id),
  CONSTRAINT scan_locks_locked_by_profile_id_fkey FOREIGN KEY (locked_by_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.scans (
  scan_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  scan_start timestamp with time zone,
  user_id smallint,
  scan_end timestamp with time zone,
  network_id uuid,
  scan_data jsonb,
  risk_score integer NOT NULL DEFAULT 0,
  CONSTRAINT scans_pkey PRIMARY KEY (scan_id),
  CONSTRAINT scans_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id)
);
CREATE TABLE public.terms_conditions (
  tc_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  content text NOT NULL,
  version text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  network_id uuid,
  CONSTRAINT terms_conditions_pkey PRIMARY KEY (tc_id),
  CONSTRAINT terms_conditions_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id)
);
CREATE TABLE public.vulnerabilities_threat (
  vt_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  scan_id bigint NOT NULL,
  vt_name text,
  vt_status text,
  vt_value text,
  vt_detail_id uuid,
  vt_kind text,
  severity_score real,
  first_seen_at timestamp with time zone,
  last_seen_at timestamp with time zone,
  occurrence_count integer NOT NULL DEFAULT 0,
  CONSTRAINT vulnerabilities_threat_pkey PRIMARY KEY (vt_id),
  CONSTRAINT vulnerabilities_threat_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.scans(scan_id),
  CONSTRAINT vulnerabilities_threat_vt_detail_id_fkey FOREIGN KEY (vt_detail_id) REFERENCES public.vulnerability_threat_details(vt_detail_id)
);
CREATE TABLE public.vulnerability_scans (
  scan_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  network_id uuid NOT NULL,
  requested_by_profile_id uuid NOT NULL,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  status USER-DEFINED NOT NULL DEFAULT 'QUEUED'::scan_status,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  target_snapshot jsonb NOT NULL CHECK (target_snapshot ? 'ssid'::text AND target_snapshot ? 'bssid'::text AND target_snapshot ? 'channel'::text),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 128),
  scan_data jsonb,
  error_code text,
  error_message text,
  error_detail jsonb,
  CONSTRAINT vulnerability_scans_pkey PRIMARY KEY (scan_id),
  CONSTRAINT vulnerability_scans_network_id_fkey FOREIGN KEY (network_id) REFERENCES public.networks(network_id),
  CONSTRAINT vulnerability_scans_requested_by_profile_id_fkey FOREIGN KEY (requested_by_profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.vulnerability_threat_details (
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  vt_description text,
  vt_cvss_vector_string text,
  vt_cvss_base_score real,
  vt_associations text,
  is_archived boolean,
  archived_at timestamp with time zone,
  vt_name text UNIQUE,
  vt_detail_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vt_code text UNIQUE,
  vt_severity_rating text CHECK (vt_severity_rating = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])),
  vt_kind text CHECK (vt_kind = ANY (ARRAY['THREAT'::text, 'VULNERABILITY'::text])),
  CONSTRAINT vulnerability_threat_details_pkey PRIMARY KEY (vt_detail_id)
);
CREATE TABLE public.vulnerability_threat_events (
  event_id bigint NOT NULL DEFAULT nextval('vulnerability_threat_events_event_id_seq'::regclass),
  scan_id bigint NOT NULL,
  vt_detail_id uuid NOT NULL,
  event_state text NOT NULL,
  event_time timestamp with time zone NOT NULL,
  raw_payload jsonb,
  CONSTRAINT vulnerability_threat_events_pkey PRIMARY KEY (event_id),
  CONSTRAINT vulnerability_threat_events_scan_id_fkey FOREIGN KEY (scan_id) REFERENCES public.scans(scan_id),
  CONSTRAINT vulnerability_threat_events_vt_detail_id_fkey FOREIGN KEY (vt_detail_id) REFERENCES public.vulnerability_threat_details(vt_detail_id)
);
CREATE TABLE public.vulnerability_threat_recommendations (
  vt_recommendation_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_archived boolean,
  archived_at timestamp with time zone,
  vt_detail_id uuid DEFAULT gen_random_uuid(),
  CONSTRAINT vulnerability_threat_recommendations_pkey PRIMARY KEY (vt_recommendation_id),
  CONSTRAINT vulnerability_threat_recommendations_vt_detail_id_fkey FOREIGN KEY (vt_detail_id) REFERENCES public.vulnerability_threat_details(vt_detail_id)
);