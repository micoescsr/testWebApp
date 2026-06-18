// routes/historyRoutes.js
//
// User-scoped history endpoints.
// JWT required — user-scoping applied inside the controller:
//   admin      → sees only their own scans
//   superadmin → sees all scans

const express = require("express");
const router = express.Router();
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");
const historyController = require("../controllers/historyController");

router.get("/vulnerabilities", authJWT, requireActiveProfile, requireAAL2, historyController.getVulnerabilityHistory);
router.get("/threats", authJWT, requireActiveProfile, requireAAL2, historyController.getThreatHistory);

module.exports = router;
