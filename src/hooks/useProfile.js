// hooks/useProfile.js
import { useEffect, useState } from "react";

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

        // mock data only; no HTTP
        await new Promise((r) => setTimeout(r, 300));
        setProfile({
          email: "pgil@gmail.com",
          firstName: "Pedro",
          lastName: "Gil",
          username: "Admin001",
        });
      } catch (err) {
        setProfileError("Failed to load profile");
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

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
