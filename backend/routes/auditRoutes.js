// routes/auditRoutes.js
const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireSuperadmin } = require("../middleware/roleMiddleware");

// All audit routes require JWT + superadmin role

// GET  /api/audit/logs   — paginated, filtered, date-range
router.get("/logs", authJWT, requireSuperadmin, auditController.getAuditLogs);

// GET  /api/audit/export — CSV download
router.get("/export", authJWT, requireSuperadmin, auditController.exportAuditLogs);

// POST /api/audit/archive — move logs older than 7 days to archive table
router.post("/archive", authJWT, requireSuperadmin, auditController.archiveAuditLogs);

module.exports = router;
