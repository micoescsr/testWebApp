// api/userApi.js
import api from "./axios";

// GET all users
export const getUserAccounts = () => {
  return api.get("/users/user_account");
};

// CREATE user
export const createUser = (userData) => {
  return api.post("/users/user_account", userData);
};
