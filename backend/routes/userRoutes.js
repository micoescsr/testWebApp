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

// Activate profile + issue temp password (superadmin only)
router.post(
  "/profiles/:id/activate-with-temp",
  authMiddleware.authJWT,
  userController.activateUserWithTemp
);

/** OPTIONAL TRIGGER FOR EASY QUERYING
 CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'role');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
 
 */
module.exports = router;
