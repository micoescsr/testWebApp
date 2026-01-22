// routes/appRoutes.js
const express = require("express");
const router = express.Router();

const userRoutes = require("./userRoutes");
//const assessmentRoutes = require("./assessmentRoutes");

// All of these end up under /api/...
router.use("/users", userRoutes);          // /api/users/...
//router.use("/assessments", assessmentRoutes); // /api/assessments/...

module.exports = router;

