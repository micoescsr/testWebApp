// routes/piProxyRoutes.js
//
// Express routes that proxy signed requests to the Pi FastAPI gateway.
// Mounted at /api/pi in server.js
//
// Endpoints:
//   GET  /api/pi/device/status
//   GET  /api/pi/networks
//   POST /api/pi/scan
//   GET  /api/pi/detect/poll?max_items=50
//   POST /api/pi/orchestrate/apply
//   POST /api/pi/portal/patch

const express = require("express");
const router = express.Router();
const piProxy = require("../controllers/piProxyController");

router.get("/device/status", piProxy.deviceStatus);
router.get("/networks", piProxy.networks);
router.post("/scan", piProxy.scan);
router.get("/detect/poll", piProxy.detectPoll);
router.post("/orchestrate/apply", piProxy.orchestrateApply);
router.post("/portal/patch", piProxy.portalPatch);

module.exports = router;
