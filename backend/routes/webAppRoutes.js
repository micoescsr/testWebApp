// routes/appRoutes.js

const express = require("express");
const router = express.Router();
const userRoutes = require("./userRoutes");
<<<<<<< Updated upstream
const networkMetadataRoutes = require("./networkMetadataRoutes");
=======
>>>>>>> Stashed changes
//const userRoutes = require("./deviceMgmtRoutes");
//const threatVulnResultRoutes = require("./threatVulnResultRoutes");
//const dashboardRoutes = require("./dashboardRoutes");

<<<<<<< Updated upstream
router.use("/users", userRoutes); 
/* router.use("/network_metadata", networkMetadataRoutes);  
router.use("/vulnerabilities", networkMetadataRoutes.);   */ 

const metadataController = require("../controllers/metadataController");

// like your rasPi routes:
router.get("/network_metadata", metadataController.getNetworkMetadata);
router.get("/vulnerabilities_latest", metadataController.getVulnerabilitiesLatest);
=======
router.use("/users", userRoutes);        
>>>>>>> Stashed changes
//router.use("/deviceMgmt", require("./deviceMgmtRoutes")); 
//router.use("/threatVuln_result", require("./threatVulnResultRoutes"));  //iseparate nlng sila sa controllers service repository
//router.use("/dashboard", require("./dashboardRoutes"));
//router.use("/search?", require("./-Routes")); 
//router.use("/filter?", require("./-Routes")); 

module.exports = router;

