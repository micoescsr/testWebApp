// routes/rasPiRoutes.js
const express = require("express");
const app = express();

app.use(express.json());

const router = express.Router();
const rasPiController = require("../controllers/rasPiController");
const { authJWT } = require("../middleware/authMiddleware");

router.get("/networks", rasPiController.getAccessPointDetails);
router.get("/networks/:networkId", rasPiController.getNetworkById);
//router.post("/networks", rasPiController.insertMetadata);

//OFFICIAL SCAN ROUTE

router.post('/scan', authJWT, rasPiController.triggerScan );
router.get('/networks_list', rasPiController.getNetworksList);
router.post('/networks', authJWT, rasPiController.saveNetworkMetadataScan);  // Matches your SAM.jsx + controller

module.exports = router;

