// api/profileApi.js
import api from "./axios";

// GET current profile
export const fetchProfile = async () => {
  return api.get("/profile");
};

// UPDATE profile fields (firstName, lastName, username, etc.)
export const updateProfile = async (body) => {
  // body example: { firstName, lastName, username }
  return api.put("/profile", body); // or PATCH if you prefer
};

// CHANGE password (separate endpoint for security)
export const updatePassword = async (body) => {
  // body: { currentPassword, newPassword }
  return api.post("/profile/password", body);
};
