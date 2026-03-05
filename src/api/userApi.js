// api/userApi.js
import api from "./axios";

// GET all users
export const getUserAccounts = () => {
  return api.get("webapp/users/profiles");
};

// UPDATE user - no backend code yet
export const updateUser = (id, userData) => {
  return api.put(`webapp/users/profiles/${id}`, userData);
};

// ADDED 3:27 PM FEB 11
export const activateUserWithTemp = (id, userData) => {
  return api.post(`webapp/users/profiles/${id}/activate-with-temp`, userData);
};
// ADDED 3:27 PM FEB 11 --- END

// Deactivate account + archive profile
export const deactivateUser = (id, { anonymize = true } = {}) => {
  return api.post(`webapp/users/profiles/${id}/deactivate`, { anonymize });
};

// Reactivate a deactivated account (set status, update profile fields, optional temp password)
export const reactivateUser = (id, { targetStatus = "active", issueTempPassword = false, profileUpdates = {} } = {}) => {
  return api.post(`webapp/users/profiles/${id}/reactivate`, { targetStatus, issueTempPassword, profileUpdates });
};

