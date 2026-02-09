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

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setProfileLoading(true);
        setProfileError(null);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setProfile(null);
          return;
        }

        const res = await api.get("webApp/users/profiles/me");
        const p = res.data;

        setProfile({
          id: p.id,
          email: p.email,
          firstName: p.first_name,
          lastName: p.last_name,
          username: p.username,
          role: p.role,
          status: p.status,
        });
      } catch (err) {
        console.error("loadProfile error:", err);
        setProfileError("Failed to load profile");
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

  //NOT FUNCTIONAL YET , KE PHAU IUUPDATE ITO
  const resetPassword = async ({ currentPassword, newPassword }) => {
    try {
      setPasswordLoading(true);
      setPasswordError(null);

      // mock success
      await new Promise((r) => setTimeout(r, 300));
      console.log("Mock reset password", { currentPassword, newPassword });
      return { success: true };
    } catch (err) {
      setPasswordError("Failed to reset password");
      return { success: false, error: err };
    } finally {
      setPasswordLoading(false);
    }
  };

  return {
    profile,
    profileLoading,
    profileError,
    resetPassword,
    passwordLoading,
    passwordError,
  };
};
