// routes/appRoutes.js

const express = require("express");
const router = express.Router();
const userRoutes = require("./userRoutes");

router.use("/users", userRoutes); 


const metadataController = require("../controllers/metadataController");
const { authJWT } = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");

// Protected metadata routes — require valid JWT
router.get("/network_metadata", authJWT, requireActiveProfile, metadataController.getNetworkMetadata);
router.get("/vulnerabilities_latest", authJWT, requireActiveProfile, metadataController.getVulnerabilitiesLatest);


module.exports = router;

