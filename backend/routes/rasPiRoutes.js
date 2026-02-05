// routes/rasPiRoutes.js
const express = require("express");
const app = express();

app.use(express.json());

const router = express.Router();
const rasPiController = require("../controllers/rasPiController");
router.get("/networks", rasPiController.getAccessPointDetails);
//router.post("/networks", rasPiController.insertMetadata);

//OFFICIAL SCAN ROUTE

const { triggerScan, getNetworksList, saveNetworkMetadataScan, insertMetadata, getAccessPointDetails } = require("../controllers/rasPiController");
//const { rasPiValidators } = require('../validators/rasPiValidators');  

// Scan validation 
router.post('/scan', rasPiController.triggerScan );
router.get('/networks_list', rasPiController.getNetworksList);
//router.post('/networks', rasPiController.saveNetwork); //for inserting the chosen network data to db
router.post('/networks', saveNetworkMetadataScan);  // Matches your SAM.jsx + controller

module.exports = router;

