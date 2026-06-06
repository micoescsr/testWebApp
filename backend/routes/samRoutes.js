const express = require("express");
const router = express.Router();
const { getThreatDetail, getVulnDetail } = require("../controllers/samController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");

// GET /api/sam/threats/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/threats/:idOrName", authJWT, requireActiveProfile, getThreatDetail);

// GET /api/sam/vulnerabilities/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/vulnerabilities/:idOrName", authJWT, requireActiveProfile, getVulnDetail);

module.exports = router;
