// src/api/deviceApi.js - network_id + scan_id aware; backend owns all config
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
});

// ─── Announcement (per-network) ──────────────────────────────────
export const getAnnouncement = (networkId) =>
  api.get(`/announcement?network_id=${networkId}`);
export const getAnnouncementHistory = (networkId) =>
  api.get(`/announcement/history?network_id=${networkId}`);
export const publishAnnouncement = (content, networkId) =>
  api.post("/announcement", { content, network_id: networkId });

// ─── Terms & Conditions (per-network) ────────────────────────────
export const getTerms = (networkId) =>
  api.get(`/terms?network_id=${networkId}`);
export const getTermsHistory = (networkId) =>
  api.get(`/terms/history?network_id=${networkId}`);
export const publishTerms = (content, version, networkId) =>
  api.post("/terms", { content, version, network_id: networkId });

// ─── AP Toggle → backend validates scan + loads config from DB ───
// payload: { network_id, scan_id?, ap_status: "enable"|"disable", ap_password? }
//   scan_id required for enable only
export const toggleAP = (payload) =>
  api.post("/device/enable-ap", payload);

// ─── AP State from DB (source of truth) ──────────────────────────
export const getApState = (networkId) =>
  api.get(`/device/ap-state/${networkId}`);

// ─── Network Config (for AP panel display) ───────────────────────
export const getNetworkConfig = (networkId) =>
  api.get(`/rasPi/networks/${networkId}`);
