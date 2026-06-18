// routes/auditRoutes.js
const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireSuperadmin } = require("../middleware/roleMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");

// All audit routes require JWT + active profile + AAL2 + superadmin role

// GET  /api/audit/logs   — paginated, filtered, date-range
router.get("/logs", authJWT, requireActiveProfile, requireAAL2, requireSuperadmin, auditController.getAuditLogs);

// GET  /api/audit/export — CSV download
router.get("/export", authJWT, requireActiveProfile, requireAAL2, requireSuperadmin, auditController.exportAuditLogs);

// POST /api/audit/archive — move logs older than 7 days to archive table
router.post("/archive", authJWT, requireActiveProfile, requireAAL2, requireSuperadmin, auditController.archiveAuditLogs);

module.exports = router;
