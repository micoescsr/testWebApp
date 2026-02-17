// api/authApi.js
import api from "./axios";

// login (you will wire this to backend later)
export const login = (credentials) => {
  return api.post("/auth/login", credentials);
};

// logout
export const logout = () => {
  return api.post("/auth/logout");
};
