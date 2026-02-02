// routes/appRoutes.js

const express = require("express");
const router = express.Router();
const userRoutes = require("./userRoutes");
//const userRoutes = require("./deviceMgmtRoutes");
//const threatVulnResultRoutes = require("./threatVulnResultRoutes");
//const dashboardRoutes = require("./dashboardRoutes");

router.use("/users", userRoutes);        
//router.use("/deviceMgmt", require("./deviceMgmtRoutes")); 
//router.use("/threatVuln_result", require("./threatVulnResultRoutes"));  //iseparate nlng sila sa controllers service repository
//router.use("/dashboard", require("./dashboardRoutes"));
//router.use("/search?", require("./-Routes")); 
//router.use("/filter?", require("./-Routes")); 

module.exports = router;

