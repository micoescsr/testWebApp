// routes/dashboardRoutes.js
//
// Dashboard routes — all JWT-protected.
// Mounted at /api/dashboard in server.js.

const express = require("express");
const router = express.Router();
const { authJWT } = require("../middleware/authMiddleware");
const { validateUUID } = require("../middleware/validateUUID");
const dashboardController = require("../controllers/dashboardController");

// Summary (all networks aggregated)
router.get("/summary", authJWT, dashboardController.getSummary);

// Network list (for dropdown)
router.get("/networks", authJWT, dashboardController.getNetworks);

// Per-network dashboard (optional ?scanId= query param for date filter)
router.get(
  "/network/:networkId",
  authJWT,
  validateUUID("networkId"),
  dashboardController.getNetwork
);

// Scan list for a network (for date dropdown)
router.get(
  "/network/:networkId/scans",
  authJWT,
  validateUUID("networkId"),
  dashboardController.getScans
);

module.exports = router;
