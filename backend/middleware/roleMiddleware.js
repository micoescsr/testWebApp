// middleware/roleMiddleware.js
const { createClient } = require("@supabase/supabase-js");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Middleware: require the authenticated user to have superadmin role.
 * Must be placed AFTER authJWT so that req.user is populated.
 */
exports.requireSuperadmin = async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "No authenticated user" });
  }

  try {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("role, status")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return res.status(401).json({ error: "Profile not found" });
    }

    if (profile.status !== "active") {
      return res.status(403).json({ error: "Account is not active", status: profile.status });
    }

    if (profile.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin access required" });
    }

    next();
  } catch (err) {
    console.error("[requireSuperadmin] error:", err);
    return res.status(500).json({ error: "Authorization check failed" });
  }
};
