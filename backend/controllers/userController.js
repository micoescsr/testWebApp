// controllers/userController.js
const { createClient } = require("@supabase/supabase-js");
const userRepository = require("../repositories/userRepository");
const crypto = require("crypto"); // temp password generation
const { logAuditEvent } = require("../utils/auditLogger");

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
    // Phase 3-B: Only superadmins can list all user profiles.
    // Regular admins should not be able to enumerate the full user table.
    const currentUser = req.user;
    if (!currentUser?.id) {
      return res.status(401).json({ error: "No authenticated user" });
    }
    const currentRole = await getCurrentUserRole(currentUser.id);
    if (currentRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin only" });
    }

    const users = await userRepository.findAllProfiles();
    res.json(users);
  } catch (error) {
    console.error("[getAllUsers] error:", error);
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
    // Phase 5-B: Field allowlist — only accept known fields to prevent mass assignment.
    const { first_name, last_name, username, email, role, status } = req.body;
    const updates = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name  !== undefined) updates.last_name  = last_name;
    if (username   !== undefined) updates.username   = username;
    if (email      !== undefined) updates.email      = email;
    if (role       !== undefined) updates.role       = role;
    if (status     !== undefined) updates.status     = status;

    // Capture old values for audit trail
    const oldProfile = await userRepository.findProfileById(id);

    // AUTH-008: If status is changing to active without temp PW issuance,
    // clear the must_change_password flag and temp_expires_at so existing PW stays valid
    const oldStatus = (oldProfile?.status || "").toLowerCase().trim();
    const newStatus = (updates.status || "").toLowerCase().trim();
    if (oldStatus !== "active" && newStatus === "active") {
      updates.must_change_password = false;
      updates.temp_expires_at = null;
    }

    const updated = await userRepository.updateProfile(id, updates);

    // Audit log
    await logAuditEvent({
      req,
      actorId: currentUser.id,
      eventName: "USER_UPDATE",
      eventStatus: "SUCCESS",
      entityType: "USER",
      entityIdUuid: id,
      oldValues: oldProfile,
      newValues: updates,
    });

    res.json(updated);
  } catch (error) {
    // Log failed attempt
    await logAuditEvent({
      req,
      actorId: req.user?.id,
      eventName: "USER_UPDATE",
      eventStatus: "FAILED",
      entityType: "USER",
      entityIdUuid: req.params.id,
      meta: { error: error.message },
    }).catch(() => {});
    res.status(500).json({ error: "Failed to update user" });
  }
}

// Superadmin-only activation with a one-time temp password
async function activateUserWithTemp(req, res) {
  try {
    const currentUser = req.user;
    if (!currentUser?.id) {
      return res.status(401).json({ error: "No authenticated user" });
    }

    const currentRole = await getCurrentUserRole(currentUser.id);
    if (currentRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin only" });
    }

    const id = req.params.id;
    const { first_name, last_name, username, email, role } = req.body;

    // Update profile and mark for password change
    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        first_name,
        last_name,
        username,
        email,
        role,
        status: "active",
        must_change_password: true,
        temp_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .eq("id", id)
      .select()
      .single();

    if (profileError) {
      console.error("activate-with-temp profileError:", profileError);
      return res.status(400).json({ error: "Failed to update profile" });
    }

    // Generate secure random temp password
    const tempPassword = crypto.randomBytes(32).toString("base64url");

    // Update auth user
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      id,
      {
        email,
        password: tempPassword,
      }
    );

    if (authError) {
      console.error("activate-with-temp authError:", authError);
      return res.status(400).json({ error: "Failed to update auth credentials" });
    }

    // Audit log for activation
    await logAuditEvent({
      req,
      actorId: currentUser.id,
      eventName: "USER_ACTIVATE",
      eventStatus: "SUCCESS",
      entityType: "USER",
      entityIdUuid: id,
      newValues: { status: "active", must_change_password: true },
    });

    return res.json({
      profile: updatedProfile,
      tempPassword,
      tempExpiresAt: updatedProfile.temp_expires_at,
    });
  } catch (error) {
    console.error("activate-with-temp error:", error);
    await logAuditEvent({
      req,
      actorId: req.user?.id,
      eventName: "USER_ACTIVATE",
      eventStatus: "FAILED",
      entityType: "USER",
      entityIdUuid: req.params.id,
      meta: { error: error.message },
    }).catch(() => {});
    return res.status(500).json({ error: "Failed to activate user with temp" });
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

    // Phase 5-C: Prevent superadmin self-deletion.
    if (currentUser.id === id) {
      return res.status(403).json({ error: "Cannot delete your own account" });
    }

    // Capture old profile for audit
    let oldProfile = null;
    try { oldProfile = await userRepository.findProfileById(id); } catch (_) {}

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) {
      console.error("auth.admin.deleteUser failed:", authError);
      await logAuditEvent({
        req,
        actorId: currentUser.id,
        eventName: "USER_DELETE",
        eventStatus: "FAILED",
        entityType: "USER",
        entityIdUuid: id,
        meta: { error: authError.message },
      }).catch(() => {});
      return res.status(400).json({ error: "Failed to delete user" });
    }

    await logAuditEvent({
      req,
      actorId: currentUser.id,
      eventName: "USER_DELETE",
      eventStatus: "SUCCESS",
      entityType: "USER",
      entityIdUuid: id,
      oldValues: oldProfile,
    });

    res.json({ message: "User deleted" });
  } catch (error) {
    await logAuditEvent({
      req,
      actorId: req.user?.id,
      eventName: "USER_DELETE",
      eventStatus: "FAILED",
      entityType: "USER",
      entityIdUuid: req.params.id,
      meta: { error: error.message },
    }).catch(() => {});
    res.status(500).json({ error: "Failed to delete user" });
  }
}

// Superadmin-only: Deactivate account and archive profile data
async function deactivateUser(req, res) {
  try {
    const currentUser = req.user;
    if (!currentUser?.id) {
      return res.status(401).json({ error: "No authenticated user" });
    }

    const currentRole = await getCurrentUserRole(currentUser.id);
    if (currentRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin only" });
    }

    const id = req.params.id;
    const { anonymize = true } = req.body;

    // Prevent self-deactivation
    if (id === currentUser.id) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    // Capture full profile snapshot for archival before any changes
    const archivedProfile = await userRepository.findProfileById(id);
    if (!archivedProfile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Build update payload
    const updates = {
      status: "inactive",
      must_change_password: false,
      temp_expires_at: null,
    };

    if (anonymize) {
      updates.first_name = "Deactivated";
      updates.last_name = "User";
      updates.username = `deactivated_${id.slice(0, 8)}`;
      updates.email = null;
    }

    const updated = await userRepository.updateProfile(id, updates);

    // Scramble the Supabase Auth password so the old password is unrecoverable.
    // This ensures that even if the account is later reactivated, a new temp
    // password must be issued — the deactivated user's old credentials are dead.
    try {
      const scrambledPassword = crypto.randomBytes(64).toString("base64url");
      await supabaseAdmin.auth.admin.updateUserById(id, {
        password: scrambledPassword,
      });
    } catch (authErr) {
      console.error("deactivateUser: failed to scramble auth password:", authErr);
      // Non-fatal — the profile is already inactive so login is blocked by statusMiddleware
    }

    // Audit log with full archived snapshot in old_values for compliance
    await logAuditEvent({
      req,
      actorId: currentUser.id,
      eventName: "USER_DEACTIVATE",
      eventStatus: "SUCCESS",
      entityType: "USER",
      entityIdUuid: id,
      oldValues: archivedProfile,
      newValues: updates,
      meta: {
        anonymized: anonymize,
        archived: true,
        reason: "Admin deactivated account via Reset Slot",
      },
    });

    return res.json({
      message: "Account deactivated and archived",
      profile: updated,
      archived: true,
    });
  } catch (error) {
    console.error("deactivateUser error:", error);
    await logAuditEvent({
      req,
      actorId: req.user?.id,
      eventName: "USER_DEACTIVATE",
      eventStatus: "FAILED",
      entityType: "USER",
      entityIdUuid: req.params.id,
      meta: { error: error.message },
    }).catch(() => {});
    return res.status(500).json({ error: "Failed to deactivate user" });
  }
}

// Superadmin-only: Reactivate a deactivated account with proper audit logging
async function reactivateUser(req, res) {
  try {
    const currentUser = req.user;
    if (!currentUser?.id) {
      return res.status(401).json({ error: "No authenticated user" });
    }

    const currentRole = await getCurrentUserRole(currentUser.id);
    if (currentRole !== "superadmin") {
      return res.status(403).json({ error: "Superadmin only" });
    }

    const id = req.params.id;
    const {
      targetStatus = "active",
      // issueTempPassword flag is accepted but ignored for active status —
      // temp password is always required when reactivating to active because
      // the old password was scrambled on deactivation.
      issueTempPassword: _issueTempPwHint = false,
      profileUpdates = {},
    } = req.body;

    // Validate target status
    if (!["active", "on_hold"].includes(targetStatus)) {
      return res.status(400).json({ error: "Target status must be 'active' or 'on_hold'" });
    }

    // Capture old profile for audit trail
    const oldProfile = await userRepository.findProfileById(id);
    if (!oldProfile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Ensure the account is actually inactive
    if ((oldProfile.status || "").toLowerCase() !== "inactive") {
      return res.status(400).json({ error: "Account is not inactive. Use the normal edit flow instead." });
    }

    // Build update payload — merge profile field updates with status change
    const updates = {
      status: targetStatus,
      must_change_password: false,
      temp_expires_at: null,
    };

    // Apply profile field updates (name, email, username, role) if provided
    const allowedFields = ["first_name", "last_name", "username", "email", "role"];
    for (const field of allowedFields) {
      if (profileUpdates[field] !== undefined && profileUpdates[field] !== "") {
        updates[field] = profileUpdates[field];
      }
    }

    let tempPassword = null;
    let tempExpiresAt = null;

    // When reactivating to active, ALWAYS issue a temp password.
    // The old password was scrambled on deactivation and is unrecoverable.
    if (targetStatus === "active") {
      tempPassword = crypto.randomBytes(32).toString("base64url");
      tempExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      updates.must_change_password = true;
      updates.temp_expires_at = tempExpiresAt;

      // Update Supabase auth password (and email if it changed)
      const authUpdate = { password: tempPassword };
      if (updates.email) {
        authUpdate.email = updates.email;
      }
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, authUpdate);
      if (authError) {
        console.error("reactivateUser authError:", authError);
        return res.status(400).json({ error: authError.message });
      }
    } else if (updates.email) {
      // Even without temp PW, update the Supabase auth email if it changed
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        email: updates.email,
      });
      if (authError) {
        console.error("reactivateUser auth email update error:", authError);
        return res.status(400).json({ error: authError.message });
      }
    }

    const updated = await userRepository.updateProfile(id, updates);

    // Audit log for reactivation
    await logAuditEvent({
      req,
      actorId: currentUser.id,
      eventName: "USER_REACTIVATE",
      eventStatus: "SUCCESS",
      entityType: "USER",
      entityIdUuid: id,
      oldValues: oldProfile,
      newValues: updates,
      meta: {
        targetStatus,
        tempPasswordIssued: !!tempPassword,
        reactivatedFrom: "inactive",
        profileFieldsUpdated: Object.keys(profileUpdates).filter(k => profileUpdates[k]),
      },
    });

    const response = {
      message: `Account reactivated to ${targetStatus}`,
      profile: updated,
    };

    if (tempPassword) {
      response.tempPassword = tempPassword;
      response.tempExpiresAt = tempExpiresAt;
    }

    return res.json(response);
  } catch (error) {
    console.error("reactivateUser error:", error);
    await logAuditEvent({
      req,
      actorId: req.user?.id,
      eventName: "USER_REACTIVATE",
      eventStatus: "FAILED",
      entityType: "USER",
      entityIdUuid: req.params.id,
      meta: { error: error.message },
    }).catch(() => {});
    return res.status(500).json({ error: "Failed to reactivate user" });
  }
}

// Export ALL at bottom (Node sees defined functions)
module.exports = { 
  //createUser, 
  getAllUsers, 
  updateUser, 
  deleteUser,
  getCurrentProfile, // NEW
  activateUserWithTemp,
  deactivateUser,
  reactivateUser,
};
