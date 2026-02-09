// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

// Current user profile
router.get(
  "/profiles/me",
  authMiddleware.authJWT,
  userController.getCurrentProfile
);

// List all profiles
router.get(
  "/profiles",
  authMiddleware.authJWT,
  userController.getAllUsers
);

// Update profile (superadmin only, enforced in controller)
router.put(
  "/profiles/:id",
  authMiddleware.authJWT,
  userController.updateUser
);

// Delete profile / user (if you still keep this)
router.delete(
  "/profiles/:id",
  authMiddleware.authJWT,
  userController.deleteUser
);

module.exports = router;
