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


/* // CREATE user
export const createUser = (userData) => {
  return api.post("webapp/users/profiles", userData);
};

// DELETE user
export const deleteUser = (id) => {
  return api.delete(`webapp/users/profiles/${id}`);
}; */
