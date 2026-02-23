// routes/appRoutes.js

const express = require("express");
const router = express.Router();
const userRoutes = require("./userRoutes");
//const networkMetadataRoutes = require("./networkMetadataRoutes");
//const userRoutes = require("./deviceMgmtRoutes");
//const threatVulnResultRoutes = require("./threatVulnResultRoutes");
//const dashboardRoutes = require("./dashboardRoutes");

router.use("/users", userRoutes); 
/* router.use("/network_metadata", networkMetadataRoutes);  
router.use("/vulnerabilities", networkMetadataRoutes.);   */ 

const metadataController = require("../controllers/metadataController");
const { authJWT } = require("../middleware/authMiddleware");

// Protected metadata routes — require valid JWT
router.get("/network_metadata", authJWT, metadataController.getNetworkMetadata);
router.get("/vulnerabilities_latest", authJWT, metadataController.getVulnerabilitiesLatest);
//router.use("/deviceMgmt", require("./deviceMgmtRoutes")); 
//router.use("/threatVuln_result", require("./threatVulnResultRoutes"));  //iseparate nlng sila sa controllers service repository
//router.use("/dashboard", require("./dashboardRoutes"));
//router.use("/search?", require("./-Routes")); 
//router.use("/filter?", require("./-Routes")); 

module.exports = router;

