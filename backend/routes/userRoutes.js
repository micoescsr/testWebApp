// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { createUserValidator } = require("../validators/userValidators"); //when it needs to be validated
const authMiddleware = require("../middleware/authMiddleware");

// Add authMiddleware to protect routes
router.post("/profiles", authMiddleware.authJWT, createUserValidator, userController.createUser);
router.get("/profiles", authMiddleware.authJWT, userController.getAllUsers);
router.put("/profiles/:id", authMiddleware.authJWT, userController.updateUser);
router.delete("/profiles/:id", authMiddleware.authJWT, userController.deleteUser);

//router.post("/user_account", createUserValidator, userController.createUser); //oop need to omit this later




//put this in frontend

/**
 fetch("http://localhost:3000/api/users/user_account", {
  method: "POST",
  headers: { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`  // Add this!
  },
  body: JSON.stringify({
    first_name, last_name, email, role: "Admin", username, password
  }),
});

 */



//HARDCODED PA 
/* const app = express();

app.post('/create-admin', authenticateSuperAdmin, async (req, res) => {  // Your super admin check
  const { email, password, username } = req.body;
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,  // Auto-confirm for managed users
    user_metadata: { username, role: 'admin' }
  });
  if (error) return res.status(400).json({ error });
  res.json({ message: 'Admin created', credentials: { email, password, username } });
}); */

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

