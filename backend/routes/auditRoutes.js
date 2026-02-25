// routes/auditRoutes.js
const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireSuperadmin } = require("../middleware/roleMiddleware");

// All audit routes require JWT + superadmin role
router.get("/logs", authJWT, requireSuperadmin, auditController.getAuditLogs);

module.exports = router;
