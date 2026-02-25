const express = require("express");
const router = express.Router();
const { getThreatDetail, getVuln } = require("../controllers/samController");
const { authJWT } = require("../middleware/authMiddleware");

// GET /api/sam/threats/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/threats/:idOrName", authJWT, getThreatDetail);

// GET /api/sam/vulnerabilities/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/vulnerabilities/:idOrName", authJWT, getVulnDetail);

module.exports = router;
