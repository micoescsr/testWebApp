// api/userApi.js
import api from "./axios";

// GET all users
export const getUserAccounts = () => {
  return api.get("webApp/users/profiles");
};

// UPDATE user - no backend code yet
export const updateUser = (id, userData) => {
  return api.put(`webApp/users/profiles/${id}`, userData);
};

// ADDED 3:27 PM FEB 11
export const activateUserWithTemp = (id, userData) => {
  return api.post(`webApp/users/profiles/${id}/activate-with-temp`, userData);
};
// ADDED 3:27 PM FEB 11 --- END


/* // CREATE user
export const createUser = (userData) => {
  return api.post("webApp/users/profiles", userData);
};

// DELETE user
export const deleteUser = (id) => {
  return api.delete(`webApp/users/profiles/${id}`);
}; */
