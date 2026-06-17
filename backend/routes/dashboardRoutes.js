// routes/dashboardRoutes.js
//
// Dashboard routes — all JWT-protected.
// Mounted at /api/dashboard in server.js.

const express = require("express");
const router = express.Router();
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");
const { validateUUID } = require("../middleware/validateUUID");
const dashboardController = require("../controllers/dashboardController");

// Summary (all networks aggregated)
router.get("/summary", authJWT, requireActiveProfile, requireAAL2, dashboardController.getSummary);

// Network list (for dropdown)
router.get("/networks", authJWT, requireActiveProfile, requireAAL2, dashboardController.getNetworks);

// Per-network dashboard (optional ?scanId= query param for date filter)
router.get(
  "/network/:networkId",
  authJWT,
  requireActiveProfile,
  requireAAL2,
  validateUUID("networkId"),
  dashboardController.getNetwork
);

// Scan list for a network (for date dropdown)
router.get(
  "/network/:networkId/scans",
  authJWT,
  requireActiveProfile,
  requireAAL2,
  validateUUID("networkId"),
  dashboardController.getScans
);

module.exports = router;
