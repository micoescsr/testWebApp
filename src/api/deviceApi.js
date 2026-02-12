// src/api/deviceApi.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
});

// Announcement (per-network, versioned)
export const getAnnouncement = () => api.get("/announcement");
export const getAnnouncementHistory = () =>
  api.get("/announcement/history");
export const publishAnnouncement = (content) =>
  api.post("/announcement", { content });

// Terms & Conditions (global, versioned)
export const getTerms = () => api.get("/terms");
export const getTermsHistory = () => api.get("/terms/history");
export const publishTerms = (content, version) =>
  api.post("/terms", { content, version });
