// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/login", authController.login);
router.post("/set-refresh", authController.setRefresh);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

module.exports = router;
