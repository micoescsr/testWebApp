
//backend/controllers/authController.js
const authService = require('../services/authService');
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const { data: { session }, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ token: session.access_token, user: session.user });
};

/* // Superadmin creates user (your modal)
exports.createUser = async (req, res) => {
  // req.user from middleware = logged-in superadmin
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', req.user.id).single();
  if (profile.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });

  const { first_name, last_name, email, role, username, password } = req.body;
  const { data: authUser, error } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { first_name, last_name, role }
  });
  if (error) return res.status(400).json({ error });
  res.json({ message: 'User created', userId: authUser.user.id });
}; */
