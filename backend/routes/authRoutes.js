// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { optionalAuthJWT, authJWT } = require("../middleware/authMiddleware");
const { loginLimiter, refreshLimiter } = require("../middleware/rateLimiter");

router.post("/login", loginLimiter, authController.login);
router.post("/set-refresh", authController.setRefresh);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout", optionalAuthJWT, authController.logout);
// AUTH-009: clears must_change_password after user sets a new password
router.post("/clear-force-reset", authJWT, authController.clearForceReset);

module.exports = router;
