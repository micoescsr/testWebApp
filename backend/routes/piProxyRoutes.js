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
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");

router.get("/device/status", authJWT, requireActiveProfile, requireAAL2, piProxy.deviceStatus);
router.get("/networks", authJWT, requireActiveProfile, requireAAL2, piProxy.networks);
router.post("/scan", authJWT, requireActiveProfile, requireAAL2, piProxy.scan);
router.get("/detect/poll", authJWT, requireActiveProfile, requireAAL2, piProxy.detectPoll);
router.post("/orchestrate/apply", authJWT, requireActiveProfile, requireAAL2, piProxy.orchestrateApply);
router.post("/portal/patch", authJWT, requireActiveProfile, requireAAL2, piProxy.portalPatch);

module.exports = router;
