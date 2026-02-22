// middleware/statusMiddleware.js
const { createClient } = require("@supabase/supabase-js");
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.requireActiveProfile = async (req, res, next) => {
  const supaUser = req.user;
  if (!supaUser?.id) {
    return res.status(401).json({ error: "No authenticated user" });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("status")
    .eq("id", supaUser.id)
    .single();

  if (error || !profile) {
    return res.status(401).json({ error: "Profile not found" });
  }

  if (profile.status !== "active") {
    // Return the actual status so the frontend can show a specific message
    return res.status(403).json({
      error: "Account is not active",
      status: profile.status,  // "on_hold" | "inactive" | etc.
    });
  }

  next();
};
