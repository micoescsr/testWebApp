// routes/detectRoutes.js
const express = require("express");
const router = express.Router();
const detectController = require("../controllers/detectController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { validate, detectStart, detectStop } = require("../validators/routeValidators");

// All detect routes require JWT
router.get("/status", authJWT, requireActiveProfile, detectController.getStatus);
router.post("/start", authJWT, requireActiveProfile, detectStart, validate, detectController.start);
router.post("/stop", authJWT, requireActiveProfile, detectStop, validate, detectController.stopDetection);
router.post("/heartbeat", authJWT, requireActiveProfile, detectController.heartbeat);
router.get("/poll", authJWT, requireActiveProfile, detectController.poll);

module.exports = router;
