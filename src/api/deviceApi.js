// src/api/deviceApi.js - UPDATED with network_id + enable-ap
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
});

// Announcement (per-network, versioned) 👈 FIXED: accepts networkId
export const getAnnouncement = (networkId) => 
  api.get(`/announcement?network_id=${networkId}`);
export const getAnnouncementHistory = (networkId) =>
  api.get(`/announcement/history?network_id=${networkId}`);
export const publishAnnouncement = (content, networkId) =>
  api.post("/announcement", { content, network_id: networkId });

// Terms & Conditions (per-network, versioned) 👈 FIXED: accepts networkId
export const getTerms = (networkId) => 
  api.get(`/terms?network_id=${networkId}`);
export const getTermsHistory = (networkId) => 
  api.get(`/terms/history?network_id=${networkId}`);
export const publishTerms = (content, version, networkId) =>
  api.post("/terms", { content, version, network_id: networkId });

// 👈 NEW: Access Point Enable (full config)
export const enableAccessPoint = (payload) =>
  api.post("/enable-ap", payload);

// 👈 NEW: Get current AP status (for polling)
export const getAccessPointStatus = () => 
  api.get("/ap-status");
