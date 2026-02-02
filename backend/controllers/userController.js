// controllers/userController.js
const userService = require("../services/userService");


async function createUser(req, res) {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to create user" });
  }
}

// ----ito ung wla pang services.js
    const userRepository = require("../repositories/userRepository");

    async function getAllUsers(req, res) {
    try {
        const users = await userRepository.findFirstUsers(10);
        res.json(users);
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Server error" });
    }
    }

    /* async function createUser(req, res) { 
    try {
        const newUser = req.body;

        // simple example insert; adapt to your schema
        const created = await userRepository.insertUser(newUser);
        res.status(201).json(created);
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Server error" });
    }
    } */


    const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.createUser = async (req, res) => {
  try {
    const { user } = await supabase.auth.getUser(req.headers.authorization);
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.data.user.id)
      .single();

    if (profile.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can create users' });
    }

    const { first_name, last_name, email, role, username, password } = req.body;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, role }
    });

    if (authError) return res.status(400).json({ error: authError.message });

    // Update profile (trigger creates it)
    await supabase.from('profiles').update({ role, username }).eq('id', authUser.user.id);

    res.status(201).json({ message: 'User created', userId: authUser.user.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  // Your existing get all logic...
};


module.exports = {createUser, getAllUsers };
