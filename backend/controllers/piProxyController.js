// controllers/piProxyController.js
//
// Proxy endpoints that forward signed requests to the Pi FastAPI gateway.
// Each handler maps an Express route to one of the 6 Pi endpoints,
// attaching HMAC-SHA256 signature headers via piGatewayService.

const { piFetch } = require("../services/piGatewayService");

// ─── 1) GET /device/status ──────────────────────────────────────
async function deviceStatus(req, res) {
  try {
    const data = await piFetch("/device/status", { method: "GET" });
    return res.json(data);
  } catch (e) {
    return res.status(e.status || 502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: e.data || String(e),
    });
  }
}

// ─── 2) GET /networks ───────────────────────────────────────────
async function networks(req, res) {
  try {
    const data = await piFetch("/networks", { method: "GET" });
    return res.json(data);
  } catch (e) {
    return res.status(e.status || 502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: e.data || String(e),
    });
  }
}

// ─── 3) POST /scan ──────────────────────────────────────────────
async function scan(req, res) {
  try {
    const data = await piFetch("/scan", { method: "POST", jsonBody: req.body });
    return res.json(data);
  } catch (e) {
    return res.status(e.status || 502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: e.data || String(e),
    });
  }
}

// ─── 4) GET /detect/poll ────────────────────────────────────────
// Query params are forwarded to the Pi AND included in the signature.
async function detectPoll(req, res) {
  try {
    const maxItems = Number(req.query.max_items) || 50;
    const data = await piFetch("/detect/poll", {
      method: "GET",
      queryString: `max_items=${encodeURIComponent(maxItems)}`,
    });
    return res.json(data);
  } catch (e) {
    return res.status(e.status || 502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: e.data || String(e),
    });
  }
}

// ─── 5) POST /orchestrate/apply ─────────────────────────────────
async function orchestrateApply(req, res) {
  try {
    const data = await piFetch("/orchestrate/apply", {
      method: "POST",
      jsonBody: req.body,
    });
    return res.json(data);
  } catch (e) {
    return res.status(e.status || 502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: e.data || String(e),
    });
  }
}

// ─── 6) POST /portal/patch ──────────────────────────────────────
async function portalPatch(req, res) {
  try {
    const data = await piFetch("/portal/patch", {
      method: "POST",
      jsonBody: req.body,
    });
    return res.json(data);
  } catch (e) {
    return res.status(e.status || 502).json({
      status: "ERROR",
      error: "pi_call_failed",
      detail: e.data || String(e),
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
