// routes/mfaRoutes.js
const express = require("express");
const router = express.Router();
const mfaController = require("../controllers/mfaController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");
const { requireSuperadmin } = require("../middleware/roleMiddleware");
const { validateUUID } = require("../middleware/validateUUID");
const { mfaLimiter } = require("../middleware/rateLimiter");

// Enrollment itself happens at aal1 — no requireAAL2 here.
router.post(
  "/sync-status",
  mfaLimiter,
  authJWT,
  requireActiveProfile,
  mfaController.syncStatus
);

// Superadmin-only recovery for a lost device — requires AAL2 itself.
router.post(
  "/admin-unenroll/:id",
  authJWT,
  requireActiveProfile,
  requireAAL2,
  requireSuperadmin,
  validateUUID("id"),
  mfaController.adminUnenroll
);

module.exports = router;
