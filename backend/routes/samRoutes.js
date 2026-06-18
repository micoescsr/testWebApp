const express = require("express");
const router = express.Router();
const { getThreatDetail, getVulnDetail } = require("../controllers/samController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");

// GET /api/sam/threats/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/threats/:idOrName", authJWT, requireActiveProfile, requireAAL2, getThreatDetail);

// GET /api/sam/vulnerabilities/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/vulnerabilities/:idOrName", authJWT, requireActiveProfile, requireAAL2, getVulnDetail);

module.exports = router;
