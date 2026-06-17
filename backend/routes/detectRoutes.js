// routes/detectRoutes.js
const express = require("express");
const router = express.Router();
const detectController = require("../controllers/detectController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");
const { validate, detectStart, detectStop } = require("../validators/routeValidators");

// All detect routes require JWT
router.get("/status", authJWT, requireActiveProfile, requireAAL2, detectController.getStatus);
router.post("/start", authJWT, requireActiveProfile, requireAAL2, detectStart, validate, detectController.start);
router.post("/stop", authJWT, requireActiveProfile, requireAAL2, detectStop, validate, detectController.stopDetection);
router.post("/heartbeat", authJWT, requireActiveProfile, requireAAL2, detectController.heartbeat);
router.get("/poll", authJWT, requireActiveProfile, requireAAL2, detectController.poll);

module.exports = router;
