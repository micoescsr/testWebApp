// backend/src/data/recommendationMap.cjs
// CommonJS view of the WFVT finding → recommendation mapping, for the Express
// backend (`require`). Backend-local copy so the Railway backend service has no
// dependency on frontend-only source files (frontend ships its own ESM mirror at
// `src/data/recommendationMap.js` + `src/data/recommendationData.json`).
// Keep this and the frontend mirror's helper functions/data in sync.
//
// Consumed by: backend/controllers/samController.js, backend/utils/reportAggregations.js

const { SOURCES, RECOMMENDATION_MAP } = require("./recommendationData.json");

/**
 * Reverse mapping — collects recommendations for a threat by scanning
 * all vulnerabilities whose recommendations reference that threat ID.
 */
function getRecommendationsForThreat(threatId) {
  const recs = [];
  for (const [vtCode, entry] of Object.entries(RECOMMENDATION_MAP)) {
    for (const rec of entry.recommendations) {
      if (rec.relatedThreatId === threatId) {
        recs.push({
          ...rec,
          fromVulnerability: vtCode,
          fromVulnerabilityName: entry.name,
        });
      }
    }
  }
  return recs;
}

/**
 * Resolve source keys to full source objects with URLs.
 */
function resolveSourceObjects(sourceKeys) {
  return (sourceKeys || []).map((key) => SOURCES[key] || { label: key, url: null });
}

module.exports = {
  SOURCES,
  RECOMMENDATION_MAP,
  getRecommendationsForThreat,
  resolveSourceObjects,
};
