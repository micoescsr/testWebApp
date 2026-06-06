// routes/rasPiRoutes.js
const express = require("express");
const app = express();

app.use(express.json());

const router = express.Router();
const rasPiController = require("../controllers/rasPiController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { validateUUID } = require("../middleware/validateUUID");
const { validate, rasPiScan, rasPiSaveNetwork } = require("../validators/routeValidators");

// --- Phase 2-B: All network routes require JWT ---
// Previously GETs were public -- anyone could enumerate all networks.
router.get("/networks", authJWT, requireActiveProfile, rasPiController.getAccessPointDetails);
router.get("/networks/:networkId", authJWT, requireActiveProfile, validateUUID('networkId'), rasPiController.getNetworkById);
//router.post("/networks", rasPiController.insertMetadata);

//OFFICIAL SCAN ROUTE

router.post('/scan', authJWT, requireActiveProfile, rasPiScan, validate, rasPiController.triggerScan );
router.get('/networks_list', authJWT, requireActiveProfile, rasPiController.getNetworksList);
router.post('/networks', authJWT, requireActiveProfile, rasPiSaveNetwork, validate, rasPiController.saveNetworkMetadataScan);  // Matches your SAM.jsx + controller

module.exports = router;

