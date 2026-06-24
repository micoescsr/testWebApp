const { supabaseClient } = require("../config/supabaseClient");
const {
  RECOMMENDATION_MAP,
  getRecommendationsForThreat,
  resolveSourceObjects,
} = require("../../src/data/recommendationMap.cjs");

// Heuristic: vt_code usually looks like WFVT-006, etc.
function looksLikeVtCode(s) {
  return /^[A-Z0-9]+-\d+$/i.test(s);
}

/**
 * Build the recommendations array for a finding.
 * - For vulnerabilities: lookup RECOMMENDATION_MAP[vtCode]
 * - For threats: reverse-map via getRecommendationsForThreat(vtCode)
 * Returns an array of rich recommendation objects with resolved source links.
 */
function buildRecommendations(vtCode, vtKind) {
  let recs = [];

  if (vtKind === "threat") {
    recs = getRecommendationsForThreat(vtCode);
  } else {
    const entry = RECOMMENDATION_MAP[vtCode];
    if (entry) {
      recs = entry.recommendations.map((r) => ({
        ...r,
        fromVulnerability: vtCode,
        fromVulnerabilityName: entry.name,
      }));
    }
  }

  return recs.map((r) => ({
    text: r.text,
    sources: resolveSourceObjects(r.sources),
    relatedThreat: r.relatedThreat || null,
    relatedThreatId: r.relatedThreatId || null,
    fromVulnerability: r.fromVulnerability || null,
    fromVulnerabilityName: r.fromVulnerabilityName || null,
    verbatimEvidence: r.verbatimEvidence || null,
    technicalMeaning: r.technicalMeaning || null,
    priority: r.priority || "Immediate",
    responsible: r.responsible || "Network Administrator",
  }));
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
        "vt_code, vt_name, vt_kind, vt_cvss_base_score, vt_severity_rating, vt_cvss_vector_string"
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
      cvssVector: detail.vt_cvss_vector_string ?? "N/A",
      description: defaultDescription(detail.vt_name, detail.vt_code),
      recommendations: buildRecommendations(detail.vt_code, "threat"),
    });
  } catch (err) {
    console.error("getThreatDetail error:", err);
    return res.status(500).json({ error: "Failed to load threat detail" });
  }
}

async function getVulnDetail(req, res) {
  try {
    const raw = (req.params.idOrName || "").trim();
    if (!raw) return res.status(400).json({ error: "idOrName is required" });

    const key = decodeURIComponent(raw);

    let q = supabaseClient
      .from("vulnerability_threat_details")
      .select(
        "vt_code, vt_name, vt_kind, vt_cvss_base_score, vt_severity_rating, vt_cvss_vector_string"
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
      // Not found in DB — return a generic detail built from the name
      return res.json({
        severity: "N/A",
        name: key,
        cvss: "N/A",
        cvssVector: "N/A",
        description: defaultDescription(key, null),
        recommendations: [],
      });
    }

    return res.json({
      severity: detail.vt_severity_rating ?? "N/A",
      name: detail.vt_name ?? key,
      cvss: detail.vt_cvss_base_score ?? "N/A",
      cvssVector: detail.vt_cvss_vector_string ?? "N/A",
      description: defaultDescription(detail.vt_name, detail.vt_code),
      recommendations: buildRecommendations(detail.vt_code, detail.vt_kind || "vulnerability"),
    });
  } catch (err) {
    console.error("getVulnDetail error:", err);
    return res.status(500).json({ error: "Failed to load vulnerability detail" });
  }
}

module.exports = { getThreatDetail, getVulnDetail };
