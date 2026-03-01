// routes/detectRoutes.js
const express = require("express");
const router = express.Router();
const detectController = require("../controllers/detectController");
const { authJWT } = require("../middleware/authMiddleware");

// All detect routes require JWT
router.get("/status", authJWT, detectController.getStatus);
router.post("/start", authJWT, detectController.start);
router.post("/stop", authJWT, detectController.stopDetection);
router.post("/heartbeat", authJWT, detectController.heartbeat);
router.get("/poll", authJWT, detectController.poll);

module.exports = router;
