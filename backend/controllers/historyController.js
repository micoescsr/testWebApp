// controllers/historyController.js
//
// User-scoped history endpoints for vulnerability scans and threat detections.
// ─ admin   → sees only their own scans (scoped by requested_by_profile_id)
// ─ superadmin → sees ALL scans (no filter)

const { supabaseClient } = require("../config/supabaseClient");

// ─── Helpers ────────────────────────────────────────────────────

/** Risk-score label (0–100 scale) */
function getRiskLabel(score) {
  const s = Number(score) || 0;
  if (s === 0) return "NONE";
  if (s <= 39) return "LOW";
  if (s <= 69) return "MEDIUM";
  if (s <= 89) return "HIGH";
  return "CRITICAL";
}

/**
 * Resolve scan_ids the current user is allowed to see.
 * Superadmin → null (no filter — all scans visible).
 * Admin      → scan_ids from vulnerability_scans where requested_by_profile_id = userId,
 *              mapped back to the legacy scans table via network_id.
 */
async function resolveScopedScanIds(userId, role) {
  // Superadmin: no restriction
  if (role === "superadmin") return null;

  // Admin: find networks they've scanned, then find legacy scan_ids for those networks
  const { data: vulnScans, error: vsErr } = await supabaseClient
    .from("vulnerability_scans")
    .select("network_id")
    .eq("requested_by_profile_id", userId);

  if (vsErr) throw vsErr;

  if (!vulnScans || vulnScans.length === 0) return [];

  // Unique network_ids this user has scanned
  const networkIds = [...new Set(vulnScans.map((v) => v.network_id).filter(Boolean))];

  if (networkIds.length === 0) return [];

  // Find legacy scan_ids linked to those networks
  const { data: scans, error: scErr } = await supabaseClient
    .from("scans")
    .select("scan_id")
    .in("network_id", networkIds);

  if (scErr) throw scErr;

  return (scans || []).map((s) => s.scan_id);
}

// ─── GET /api/history/vulnerabilities ───────────────────────────

async function getVulnerabilityHistory(req, res) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    // 1) Determine scoped scan_ids
    const allowedScanIds = await resolveScopedScanIds(userId, role);

    // Empty array means user has no scans at all
    if (Array.isArray(allowedScanIds) && allowedScanIds.length === 0) {
      return res.json([]);
    }

    // 2) Query scans with network join
    let scansQuery = supabaseClient
      .from("scans")
      .select(`
        scan_id,
        created_at,
        scan_start,
        scan_end,
        scan_data,
        risk_score,
        networks (
          ssid,
          bssid,
          channel,
          num_clients
        )
      `)
      .order("created_at", { ascending: false });

    // Apply user-scoping for non-superadmin
    if (allowedScanIds !== null) {
      scansQuery = scansQuery.in("scan_id", allowedScanIds);
    }

    const { data: scans, error: scansError } = await scansQuery;
    if (scansError) throw scansError;

    const scanIds = scans.map((s) => s.scan_id);
    if (scanIds.length === 0) return res.json([]);

    // 3) Get vulnerability findings for those scans
    const { data: findings, error: findingsError } = await supabaseClient
      .from("vulnerabilities_threat")
      .select(`
        scan_id,
        vt_name,
        vt_kind,
        vt_status,
        vt_value,
        severity_score,
        detail:vulnerability_threat_details (
          vt_code,
          vt_name,
          vt_severity_rating,
          vt_cvss_base_score
        )
      `)
      .in("scan_id", scanIds)
      .eq("vt_kind", "vulnerability");

    if (findingsError) throw findingsError;

    // 4) Group findings by scan_id
    const byScan = new Map();
    for (const f of findings) {
      if (!byScan.has(f.scan_id)) byScan.set(f.scan_id, []);
      byScan.get(f.scan_id).push(f);
    }

    // 5) Map to frontend shape
    const result = scans.map((scan) => {
      const items = byScan.get(scan.scan_id) || [];
      const net = scan.networks || {};

      const ssid =
        net.ssid ||
        scan.scan_data?.ssid ||
        scan.scan_data?.network_name ||
        `Scan ${scan.scan_id}`;

      return {
        id: scan.scan_id,
        datetime: scan.created_at,
        ssid,
        bssid: net.bssid || scan.scan_data?.bssid || null,
        channel: net.channel ?? scan.scan_data?.channel ?? null,
        scan_start: scan.scan_start || scan.scan_data?.scan_start || null,
        scan_end: scan.scan_end || scan.scan_data?.scan_end || null,
        num_clients: net.num_clients ?? scan.scan_data?.num_clients ?? null,
        riskScore: scan.risk_score ?? 0,
        riskLabel: getRiskLabel(scan.risk_score ?? 0),
        summary: items.length,
        details: items.map((i) => ({
          id: i.detail?.vt_code ?? null,
          severity: i.detail?.vt_severity_rating ?? "UNKNOWN",
          name: i.detail?.vt_name || i.vt_name || i.vt_kind,
          score: i.detail?.vt_cvss_base_score ?? i.severity_score ?? 0,
          status: i.vt_status || null,
          value: i.vt_value || null,
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[history/vulnerabilities] error:", err);
    res.status(500).json({ error: "Failed to fetch vulnerability history" });
  }
}

// ─── GET /api/history/threats ───────────────────────────────────

async function getThreatHistory(req, res) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    // 1) Determine scoped scan_ids
    const allowedScanIds = await resolveScopedScanIds(userId, role);

    if (Array.isArray(allowedScanIds) && allowedScanIds.length === 0) {
      return res.json([]);
    }

    // 2) Query scans
    let scansQuery = supabaseClient
      .from("scans")
      .select(`
        scan_id,
        created_at,
        scan_start,
        scan_end,
        scan_data,
        risk_score,
        networks (
          ssid,
          bssid,
          channel,
          num_clients
        )
      `)
      .order("created_at", { ascending: false });

    if (allowedScanIds !== null) {
      scansQuery = scansQuery.in("scan_id", allowedScanIds);
    }

    const { data: scans, error: scansError } = await scansQuery;
    if (scansError) throw scansError;

    const scanIds = scans.map((s) => s.scan_id);
    if (scanIds.length === 0) return res.json([]);

    // 3) Get threat findings for those scans
    const { data: findings, error: findingsError } = await supabaseClient
      .from("vulnerabilities_threat")
      .select(`
        scan_id,
        vt_name,
        vt_kind,
        vt_status,
        severity_score,
        detail:vulnerability_threat_details(
          vt_code,
          vt_severity_rating,
          vt_cvss_base_score
        )
      `)
      .in("scan_id", scanIds)
      .eq("vt_kind", "threat");

    if (findingsError) throw findingsError;

    // 4) Group findings by scan_id
    const byScan = new Map();
    for (const f of findings) {
      if (!byScan.has(f.scan_id)) byScan.set(f.scan_id, []);
      byScan.get(f.scan_id).push(f);
    }

    // 5) Map to frontend shape
    const result = scans.map((scan) => {
      const items = byScan.get(scan.scan_id) || [];
      const net = scan.networks || {};

      const ssid =
        net.ssid ||
        scan.scan_data?.ssid ||
        scan.scan_data?.network_name ||
        `Scan ${scan.scan_id}`;

      return {
        id: scan.scan_id,
        datetime: scan.created_at,
        ssid,
        bssid: net.bssid || scan.scan_data?.bssid || null,
        channel: net.channel ?? scan.scan_data?.channel ?? null,
        scan_start: scan.scan_start || scan.scan_data?.scan_start || null,
        scan_end: scan.scan_end || scan.scan_data?.scan_end || null,
        num_clients: net.num_clients ?? scan.scan_data?.num_clients ?? null,
        riskScore: scan.risk_score ?? 0,
        riskLabel: getRiskLabel(scan.risk_score ?? 0),
        summary: items.length,
        threats: items.map((i) => ({
          code: i.detail?.vt_code ?? null,
          severity: i.detail?.vt_severity_rating ?? "UNKNOWN",
          name: i.vt_name || i.vt_kind,
          score: i.detail?.vt_cvss_base_score ?? i.severity_score ?? 0,
          status: i.vt_status || null,
          occurrences: 1,
          window: "",
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[history/threats] error:", err);
    res.status(500).json({ error: "Failed to fetch threat history" });
  }
}

module.exports = { getVulnerabilityHistory, getThreatHistory };
