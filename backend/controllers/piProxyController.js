// controllers/piProxyController.js
//
// Proxy endpoints that forward signed requests to the Pi FastAPI gateway.
// Each handler maps an Express route to one of the 6 Pi endpoints,
// attaching HMAC-SHA256 signature headers via utils/piFetch.

const { piFetch } = require("../utils/piFetch");

/**
 * Shared handler: forward a piFetch result to the Express response.
 * utils/piFetch returns { ok, status, data, rawText }.
 */
function sendPiResult(res, result) {
  if (!result.ok) {
    console.error("[piProxy] Pi returned error:", result.status, result.data ?? result.rawText);
    return res.status(result.status).json({
      status: "ERROR",
      error: "pi_call_failed",
    });
  }
  return res.status(result.status).json(result.data);
}

// ─── 1) GET /device/status ──────────────────────────────────────
async function deviceStatus(req, res) {
  try {
    const result = await piFetch("/device/status");
    return sendPiResult(res, result);
  } catch (e) {
    console.error("[piProxy/deviceStatus]", e);
    return res.status(502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: "Failed to reach device status endpoint",
    });
  }
}

// ─── 2) GET /networks ───────────────────────────────────────────
async function networks(req, res) {
  try {
    const result = await piFetch("/networks");
    return sendPiResult(res, result);
  } catch (e) {
    console.error("[piProxy/networks]", e);
    return res.status(502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: "Failed to reach networks endpoint",
    });
  }
}

// ─── 3) POST /scan ──────────────────────────────────────────────
async function scan(req, res) {
  try {
    const result = await piFetch("/scan", { method: "POST", jsonBody: req.body });
    return sendPiResult(res, result);
  } catch (e) {
    console.error("[piProxy/scan]", e);
    return res.status(502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: "Failed to reach scan endpoint",
    });
  }
}

// ─── 4) GET /detect/poll ────────────────────────────────────────
// Query params are forwarded to the Pi AND included in the signature.
async function detectPoll(req, res) {
  try {
    const maxItems = Number(req.query.max_items) || 50;
    const result = await piFetch("/detect/poll", {
      query: `max_items=${maxItems}`,
    });
    return sendPiResult(res, result);
  } catch (e) {
    console.error("[piProxy/detectPoll]", e);
    return res.status(502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: "Failed to reach detect poll endpoint",
    });
  }
}

// ─── 5) POST /orchestrate/apply ─────────────────────────────────
async function orchestrateApply(req, res) {
  try {
    const result = await piFetch("/orchestrate/apply", {
      method: "POST",
      jsonBody: req.body,
    });
    return sendPiResult(res, result);
  } catch (e) {
    console.error("[piProxy/orchestrateApply]", e);
    return res.status(502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: "Failed to reach orchestrate endpoint",
    });
  }
}

// ─── 6) POST /portal/patch ──────────────────────────────────────
async function portalPatch(req, res) {
  try {
    const result = await piFetch("/portal/patch", {
      method: "POST",
      jsonBody: req.body,
    });
    return sendPiResult(res, result);
  } catch (e) {
    console.error("[piProxy/portalPatch]", e);
    return res.status(502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: "Failed to reach portal patch endpoint",
    });
  }
}

module.exports = {
  deviceStatus,
  networks,
  scan,
  detectPoll,
  orchestrateApply,
  portalPatch,
};
