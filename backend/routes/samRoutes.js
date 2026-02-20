const express = require("express");
const router = express.Router();
const { getThreatDetail } = require("../controllers/samController");

// GET /api/sam/threats/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/threats/:idOrName", getThreatDetail);

module.exports = router;
