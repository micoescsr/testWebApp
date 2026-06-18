// controllers/mfaController.js
const { createClient } = require("@supabase/supabase-js");
const userRepository = require("../repositories/userRepository");
const { logAuditEvent } = require("../utils/auditLogger");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/auth/mfa/sync-status — re-derive mfa_enrolled from Supabase's
// own factor list (source of truth), not the client-supplied body alone.
async function syncStatus(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "No authenticated user" });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
    if (error) {
      console.error("syncStatus: listFactors failed:", error.message);
      return res.status(500).json({ error: "Failed to sync MFA status" });
    }

    const factors = data?.factors || [];
    const mfaEnrolled = factors.some((f) => f.status === "verified");

    await userRepository.updateProfile(userId, { mfa_enrolled: mfaEnrolled });

    await logAuditEvent({
      req,
      actorId: userId,
      eventName: mfaEnrolled ? "USER.MFA_ENROLLED" : "USER.MFA_UNENROLLED",
      eventStatus: "SUCCESS",
      entityType: "USER",
      entityIdUuid: userId,
      meta: { factorCount: factors.length },
    });

    return res.json({ ok: true, mfaEnrolled });
  } catch (error) {
    console.error("syncStatus error:", error);
    return res.status(500).json({ error: "Failed to sync MFA status" });
  }
}

// POST /api/auth/mfa/admin-unenroll/:id — superadmin recovery for a user who
// lost their authenticator device. Removes all TOTP factors via the
// Supabase Admin API and forces re-enrollment on next login.
async function adminUnenroll(req, res) {
  const targetId = req.params.id;
  const actorId = req.user?.id;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: targetId });
    if (error) {
      console.error("adminUnenroll: listFactors failed:", error.message);
      return res.status(500).json({ error: "Failed to reset MFA" });
    }

    const factors = data?.factors || [];
    for (const factor of factors) {
      const { error: deleteError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        userId: targetId,
        id: factor.id,
      });
      if (deleteError) {
        console.error("adminUnenroll: deleteFactor failed:", deleteError.message);
        return res.status(500).json({ error: "Failed to reset MFA" });
      }
    }

    await userRepository.updateProfile(targetId, { mfa_enrolled: false });

    await logAuditEvent({
      req,
      actorId,
      eventName: "USER.MFA_RESET",
      eventStatus: "SUCCESS",
      entityType: "USER",
      entityIdUuid: targetId,
      meta: { factorsRemoved: factors.length },
    });

    return res.json({
      ok: true,
      message: "MFA factors removed. User must re-enroll on next login.",
    });
  } catch (error) {
    console.error("adminUnenroll error:", error);
    return res.status(500).json({ error: "Failed to reset MFA" });
  }
}

module.exports = { syncStatus, adminUnenroll };
