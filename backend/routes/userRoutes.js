// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireActiveProfile } = require("../middleware/statusMiddleware");
const { validateUUID } = require("../middleware/validateUUID");
const { validate, userUpdate, userActivateWithTemp, userDeactivate, userReactivate } = require("../validators/routeValidators");

// Current user profile
router.get(
  "/profiles/me",
  authMiddleware.authJWT,
  requireActiveProfile,
  userController.getCurrentProfile
);

// List all profiles
router.get(
  "/profiles",
  authMiddleware.authJWT,
  requireActiveProfile,
  userController.getAllUsers
);

// Update profile (superadmin only, enforced in controller)
router.put(
  "/profiles/:id",
  authMiddleware.authJWT,
  requireActiveProfile,
  validateUUID('id'),
  userUpdate, validate,
  userController.updateUser
);

// Delete profile / user (if you still keep this)
router.delete(
  "/profiles/:id",
  authMiddleware.authJWT,
  requireActiveProfile,
  validateUUID('id'),
  userController.deleteUser
);

// Activate profile + issue temp password (superadmin only)
router.post(
  "/profiles/:id/activate-with-temp",
  authMiddleware.authJWT,
  requireActiveProfile,
  validateUUID('id'),
  userActivateWithTemp, validate,
  userController.activateUserWithTemp
);

// Deactivate profile + archive (superadmin only)
router.post(
  "/profiles/:id/deactivate",
  authMiddleware.authJWT,
  requireActiveProfile,
  validateUUID('id'),
  userDeactivate, validate,
  userController.deactivateUser
);

// Reactivate a deactivated account (superadmin only)
router.post(
  "/profiles/:id/reactivate",
  authMiddleware.authJWT,
  requireActiveProfile,
  validateUUID('id'),
  userReactivate, validate,
  userController.reactivateUser
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
