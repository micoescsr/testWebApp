// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { optionalAuthJWT } = require("../middleware/authMiddleware");

router.post("/login", authController.login);
router.post("/set-refresh", authController.setRefresh);
router.post("/refresh", authController.refresh);
router.post("/logout", optionalAuthJWT, authController.logout);

module.exports = router;
