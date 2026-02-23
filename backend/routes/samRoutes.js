const express = require("express");
const router = express.Router();
const { getThreatDetail } = require("../controllers/samController");
const { authJWT } = require("../middleware/authMiddleware");

// GET /api/sam/threats/:idOrName  (vt_code preferred, falls back to vt_name)
router.get("/threats/:idOrName", authJWT, getThreatDetail);

module.exports = router;
