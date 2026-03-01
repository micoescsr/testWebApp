// api/detectApi.js
//
// Frontend API helpers for the detection lifecycle endpoints.
// Uses the shared axios instance (baseURL = "http://localhost:3000/api").

import api from "./axios";

/** GET /api/detect/status — current detection state (heartbeat-enforced) */
export async function getDetectStatus() {
  const res = await api.get("/detect/status");
  return res.data;
}

/** POST /api/detect/start — start or switch detection target */
export async function startDetect(networkId, scanId) {
  const res = await api.post("/detect/start", {
    network_id: networkId,
    scan_id: scanId,
  });
  return res.data;
}

/** POST /api/detect/stop — stop detection */
export async function stopDetect(reason) {
  const res = await api.post("/detect/stop", { reason: reason || null });
  return res.data;
}

/** GET /api/detect/poll — poll for live threat results (gated by state) */
export async function pollDetect(maxItems = 50) {
  const res = await api.get("/detect/poll", { params: { max_items: maxItems } });
  return res.data;
}
