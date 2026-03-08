// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { optionalAuthJWT } = require("../middleware/authMiddleware");
const { loginLimiter, refreshLimiter } = require("../middleware/rateLimiter");
const { login: loginValidation, validate } = require("../validators/authValidator");

router.post("/login", loginLimiter, loginValidation, validate, authController.login);
router.post("/set-refresh", authController.setRefresh);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout", optionalAuthJWT, authController.logout);

module.exports = router;
