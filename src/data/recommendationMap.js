// src/data/recommendationMap.js
// ESM view of the WFVT finding → recommendation mapping, for the Vite frontend
// (`import`). The DATA is the single source of truth in `recommendationData.json`
// (loaded natively by both Vite and Node `require`).
//
// Vite does NOT transform CommonJS (`module.exports`) files served from `src/`,
// so the frontend cannot import `recommendationMap.cjs` directly — hence this
// ESM mirror. Keep the two helper functions below in sync with the `.cjs`.
//
// Consumed by: src/utils/reportDataAdapter.js

import recommendationData from "./recommendationData.json";

export const SOURCES = recommendationData.SOURCES;
export const RECOMMENDATION_MAP = recommendationData.RECOMMENDATION_MAP;

/**
 * Reverse mapping — collects recommendations for a threat by scanning
 * all vulnerabilities whose recommendations reference that threat ID.
 */
export function getRecommendationsForThreat(threatId) {
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
export function resolveSourceObjects(sourceKeys) {
  return (sourceKeys || []).map((key) => SOURCES[key] || { label: key, url: null });
}
