
// services/assessmentService.js (wla pa userservice.js)
const assessmentRepository = require("../repositories/assessmentRepository.js");

async function createFromApp(userId, payload) {
  const metrics = extractMetrics(payload.rawScanData);
  const score = computeScore(metrics);

  return assessmentRepository.insert({
    userId,
    networkId: payload.networkId,
    metrics,
    score,
    createdAt: new Date(),
  });
}

module.exports = { createFromApp };
