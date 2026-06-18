// hooks/useProfile.js
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import api from "../api/axios";

export const useProfile = () => {
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  const loadProfile = async () => {
    try {
      setProfileLoading(true);
      setProfileError(null);

      // Get profile data from backend (Bearer token attached by axios interceptor)
      const res = await api.get("webapp/users/profiles/me");
      const p = res.data;

      setProfile({
        id: p.id,
        email: p.email,
        firstName: p.first_name,
        lastName: p.last_name,
        username: p.username,
        role: p.role,
        status: p.status,
        mfaEnrolled: p.mfa_enrolled,
      });
    } catch (err) {
      console.error("loadProfile error:", err);
      setProfileError("Failed to load profile");
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Standard "change password while logged in"
  const resetPassword = async ({ currentPassword, newPassword }) => {
    try {
      setPasswordLoading(true);
      setPasswordError(null);

      if (!profile?.email) {
        throw new Error("No email found for current user");
      }

      // 1) Verify current password by signing in again.[web:48][web:66]
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: profile.email,
          password: currentPassword,
        });

      if (signInError || !signInData?.user) {
        const msg = "Current password is incorrect";
        setPasswordError(msg);
        return { success: false, error: { message: msg } };
      }

      // 2) Update password using Supabase Auth.[web:19][web:75]
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error("updateUser error:", updateError);
        const msg =
          updateError.message || "Failed to update password. Please try again.";
        setPasswordError(msg);
        return { success: false, error: { message: msg } };
      }

      return { success: true };
    } catch (err) {
      console.error("resetPassword exception:", err);
      const msg = err.message || "Failed to reset password";
      setPasswordError(msg);
      return { success: false, error: { message: msg } };
    } finally {
      setPasswordLoading(false);
    }
  };

  return {
    profile,
    profileLoading,
    profileError,
    refetchProfile: loadProfile,
    resetPassword,
    passwordLoading,
    passwordError,
  };
};
