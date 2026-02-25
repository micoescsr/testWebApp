const express = require("express");
const router = express.Router();
const { getThreatDetail, getVulnDetail } = require("../controllers/samController");

// GET /api/sam/threats/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/threats/:idOrName", getThreatDetail);

// GET /api/sam/vulnerabilities/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/vulnerabilities/:idOrName", getVulnDetail);

module.exports = router;
