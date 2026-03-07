-- Metrics views and per-network / summary SQL
-- Rewritten to use the legacy `scans` table (bigint PK) as the canonical source
-- for finished_at and risk_score. This mirrors the request "match with scans table na lang".

-- View: latest_scan_per_network
CREATE OR REPLACE VIEW public.latest_scan_per_network AS
WITH latest_scans AS (
  -- pick the latest legacy scan (scans.scan_end) per network
  SELECT DISTINCT ON (network_id)
    scan_id,
    network_id,
    scan_end AS finished_at,
    risk_score
  FROM public.scans
  WHERE scan_end IS NOT NULL
  ORDER BY network_id, scan_end DESC
)
SELECT
  ls.network_id,
  ls.scan_id,
  ls.finished_at,
  COALESCE(ls.risk_score, 0) AS risk_score
FROM latest_scans ls;

-- View: latest_scan_findings
-- Joins deduplicated vulnerabilities_threat rows (latest per scan/vt_detail)
-- to the legacy `scans` table and threat detail metadata.
CREATE OR REPLACE VIEW public.latest_scan_findings AS
WITH latest_legacy_scan AS (
  SELECT DISTINCT ON (s.network_id)
    s.scan_id,
    s.network_id,
    s.scan_end
  FROM public.scans s
  WHERE s.scan_end IS NOT NULL
  ORDER BY s.network_id, s.scan_end DESC
),
-- deduplicate latest threat state per (scan_id, vt_detail_id)
deduplicated AS (
  SELECT DISTINCT ON (vt.scan_id, vt.vt_detail_id)
    vt.scan_id,
    vt.vt_detail_id,
    vt.occurrence_count,
    vt.created_at
  FROM public.vulnerabilities_threat vt
  ORDER BY vt.scan_id, vt.vt_detail_id, vt.created_at DESC
)
SELECT
  lls.network_id,
  s.risk_score,
  n.ssid,
  n.encryption_status,
  n.num_clients,
  d.vt_detail_id,
  vtd.vt_name,
  vtd.vt_kind,
  vtd.vt_severity_rating,
  vtd.vt_cvss_base_score,
  d.occurrence_count
FROM latest_legacy_scan lls
JOIN deduplicated d
  ON d.scan_id = lls.scan_id
JOIN public.vulnerability_threat_details vtd
  ON vtd.vt_detail_id = d.vt_detail_id
JOIN public.networks n
  ON n.network_id = lls.network_id
LEFT JOIN public.scans s
  ON s.scan_id = lls.scan_id;

-- Per-network dashboard queries (use WHERE network_id = $1)

-- 1. Last Scan Date
-- SELECT finished_at FROM public.latest_scan_per_network WHERE network_id = $1;

-- 2. Current Risk Score
-- SELECT risk_score FROM public.latest_scan_per_network WHERE network_id = $1;

-- 3. Network Encryption
-- SELECT encryption_status FROM public.networks WHERE network_id = $1;

-- 4. Connected Clients
-- SELECT num_clients FROM public.networks WHERE network_id = $1;

-- 5. Total Vulnerabilities
-- SELECT COUNT(DISTINCT vt_detail_id) FROM public.latest_scan_findings WHERE network_id = $1 AND vt_kind = 'VULNERABILITY';

-- 6. Total Threats
-- SELECT COUNT(DISTINCT vt_detail_id) FROM public.latest_scan_findings WHERE network_id = $1 AND vt_kind = 'THREAT';

-- 7. Threat vs Vulnerability (Donut)
-- SELECT vt_kind, COUNT(DISTINCT vt_detail_id) AS total FROM public.latest_scan_findings WHERE network_id = $1 GROUP BY vt_kind;

-- 8. Severity Distribution (Bar Chart)
-- SELECT vt_severity_rating, vt_kind, COUNT(DISTINCT vt_detail_id) AS total FROM public.latest_scan_findings WHERE network_id = $1 GROUP BY vt_severity_rating, vt_kind;

-- 9. Top High-Risk Issues
-- SELECT vt_name, vt_severity_rating, vt_cvss_base_score FROM public.latest_scan_findings WHERE network_id = $1 ORDER BY vt_cvss_base_score DESC LIMIT 5;

-- 10. Clients vs Risk Trend (Line Chart)
-- SELECT s.scan_end AS finished_at, n.num_clients, s.risk_score FROM public.scans s JOIN public.networks n ON n.network_id = s.network_id WHERE s.network_id = $1 ORDER BY s.scan_end;

-- Summary dashboard queries (no network filter)
-- 11. Global Last Scan
-- SELECT MAX(scan_end) FROM public.scans;

-- 12. Open Networks
-- SELECT COUNT(*) FROM public.networks WHERE encryption_status = 'Open';

-- 13. Encrypted Networks
-- SELECT COUNT(*) FROM public.networks WHERE encryption_status != 'Open';

-- 14. Total Vulnerabilities/Threats
-- SELECT COUNT(DISTINCT vt_detail_id) FROM public.latest_scan_findings;

-- 15. Total Clients
-- SELECT SUM(num_clients) FROM public.networks;

-- 16. Wi-Fi Security Risk Score (Global Average)
-- SELECT ROUND(AVG(risk_score)) FROM public.latest_scan_per_network;

-- 17. Severity by Kind (Global)
-- SELECT vt_severity_rating, vt_kind, COUNT(DISTINCT vt_detail_id) AS total FROM public.latest_scan_findings GROUP BY vt_severity_rating, vt_kind;

-- 18. Top 5 High-Risk Networks
-- SELECT l.network_id, n.ssid, l.risk_score, COUNT(DISTINCT f.vt_detail_id) AS total_findings, n.num_clients
-- FROM public.latest_scan_per_network l
-- JOIN public.networks n ON n.network_id = l.network_id
-- LEFT JOIN public.latest_scan_findings f ON f.network_id = l.network_id
-- GROUP BY l.network_id, n.ssid, l.risk_score, n.num_clients
-- ORDER BY l.risk_score DESC LIMIT 5;
