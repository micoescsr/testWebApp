// controllers/userController.js
const { createClient } = require("@supabase/supabase-js");
const userRepository = require("../repositories/userRepository");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const getCurrentUserRole = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data.role;
};


// NEW: return current user's profile
async function getCurrentProfile(req, res) {
  try {
    const currentUser = req.user;
    if (!currentUser?.id) {
      return res.status(401).json({ error: "No authenticated user" });
    }

    const profile = await userRepository.findProfileById(currentUser.id);
    res.json(profile);
  } catch (error) {
    console.error("getCurrentProfile error:", error);
    res.status(500).json({ error: "Failed to fetch current profile" });
  }
}

// Define functions FIRST
/* async function createUser(req, res) {
  try {
     console.log("createUser body:", req.body);     // <- log payload
    const currentUser = req.user;
    const role = await getCurrentUserRole(currentUser.id);
    console.log("createUser current role:", role); // <- log role

    if (role !== "superadmin") {
      return res.status(403).json({ error: "Only superadmins can create users" });
    }

    const { first_name, last_name, email, role: newRole, username, password } = req.body;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, role: newRole },
    });

    //if (authError) return res.status(400).json({ error: authError.message });
    if (authError) {
      console.error("auth.admin.createUser error:", authError);
      return res.status(400).json({ error: authError.message });
    }

    await supabaseAdmin
      .from("profiles")
      .update({ role: newRole, username })
      .eq("id", authData.user.id);

    const profile = await userRepository.findProfileById(authData.user.id);
    res.status(201).json({ message: "User created", profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
} */

async function getAllUsers(req, res) {
  try {
    const users = await userRepository.findAllProfiles();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
}

async function updateUser(req, res) {
  try {
    const currentUser = req.user;
    const currentRole = await getCurrentUserRole(currentUser.id);
    
    if (currentRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin only" });
    }

    const id = req.params.id;
    const updates = req.body;  // may contain { first_name, last_name, username, role, status }

    const updated = await userRepository.updateProfile(id, updates);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
}


async function deleteUser(req, res) {
  try {
    const currentUser = req.user;
    const currentRole = await getCurrentUserRole(currentUser.id);
    
    if (currentRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin only" });
    }

    const id = req.params.id;

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) {
      console.error("auth.admin.deleteUser failed:", authError);
      return res.status(400).json({ error: authError.message });
    }

    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
}

// Export ALL at bottom (Node sees defined functions)
module.exports = { 
  //createUser, 
  getAllUsers, 
  updateUser, 
  deleteUser,
  getCurrentProfile, // NEW
};
