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


/* // CREATE user
export const createUser = (userData) => {
  return api.post("webApp/users/profiles", userData);
};

// DELETE user
export const deleteUser = (id) => {
  return api.delete(`webApp/users/profiles/${id}`);
}; */
