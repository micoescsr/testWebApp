// routes/rasPiRoutes.js
const express = require("express");
const app = express();

app.use(express.json());

const router = express.Router();
const rasPiController = require("../controllers/rasPiController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { requireAAL2 } = require("../middleware/mfaMiddleware");
const { validateUUID } = require("../middleware/validateUUID");
const { validate, rasPiScan, rasPiSaveNetwork } = require("../validators/routeValidators");

// --- Phase 2-B: All network routes require JWT ---
// Previously GETs were public -- anyone could enumerate all networks.
router.get("/networks", authJWT, requireActiveProfile, requireAAL2, rasPiController.getAccessPointDetails);
router.get("/networks/:networkId", authJWT, requireActiveProfile, requireAAL2, validateUUID('networkId'), rasPiController.getNetworkById);
//router.post("/networks", rasPiController.insertMetadata);

//OFFICIAL SCAN ROUTE

router.post('/scan', authJWT, requireActiveProfile, requireAAL2, rasPiScan, validate, rasPiController.triggerScan );
router.get('/networks_list', authJWT, requireActiveProfile, requireAAL2, rasPiController.getNetworksList);
router.post('/networks', authJWT, requireActiveProfile, requireAAL2, rasPiSaveNetwork, validate, rasPiController.saveNetworkMetadataScan);  // Matches your SAM.jsx + controller

module.exports = router;

