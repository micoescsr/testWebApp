const { supabaseClient } = require("../config/supabaseClient");

// Heuristic: vt_code usually looks like WFVT-006, etc.
function looksLikeVtCode(s) {
  return /^[A-Z0-9]+-\d+$/i.test(s);
}

function defaultRecommendations() {
  return {
    nist: [
      "Maintain continuous monitoring of wireless infrastructure and alert on anomalies.",
      "Segment guest and internal networks to reduce blast radius.",
      "Enforce strong authentication and key management for wireless access.",
    ],
    owasp: [
      "Enable secure configurations and disable legacy/weak security modes.",
      "Use network monitoring / IDS to detect suspicious wireless activity.",
      "Harden AP management interfaces and restrict admin access.",
    ],
  };
}

function defaultDescription(vtName, vtCode) {
  const label = vtName || "This finding";
  const code = vtCode ? ` (${vtCode})` : "";
  return `${label}${code} was detected during analysis. Review the observed behavior and apply the recommendations to mitigate risk.`;
}

async function getThreatDetail(req, res) {
  try {
    const raw = (req.params.idOrName || "").trim();
    if (!raw) return res.status(400).json({ error: "idOrName is required" });

    const key = decodeURIComponent(raw);

    let q = supabaseClient
      .from("vulnerability_threat_details")
      .select(
        "vt_code, vt_name, vt_kind, vt_cvss_base_score, vt_severity_rating"
      );

    // Prefer exact vt_code lookup when possible
    if (looksLikeVtCode(key)) {
      q = q.eq("vt_code", key);
    } else {
      // fallback: match by name (case-insensitive)
      q = q.ilike("vt_name", key);
    }

    const { data: detail, error } = await q.maybeSingle();
    if (error) throw error;

    if (!detail) {
      return res.status(404).json({ error: "Threat detail not found" });
    }

    // Enforce kind on the endpoint (this endpoint is for threats)
    if (detail.vt_kind && detail.vt_kind !== "threat") {
      return res.status(404).json({ error: "Not a threat code/name" });
    }

    return res.json({
      severity: detail.vt_severity_rating ?? "N/A",
      name: detail.vt_name ?? key,
      cvss: detail.vt_cvss_base_score ?? "N/A",
      cvssVector: "N/A",
      description: defaultDescription(detail.vt_name, detail.vt_code),
      recommendations: defaultRecommendations(),
    });
  } catch (err) {
    console.error("getThreatDetail error:", err);
    return res.status(500).json({ error: "Failed to load threat detail" });
  }
}

module.exports = { getThreatDetail };
