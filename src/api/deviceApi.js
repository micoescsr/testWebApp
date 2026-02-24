// src/api/deviceApi.js - network_id aware + orchestrate/apply + portal/patch
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

// ─── AP Toggle → orchestrate/apply via backend proxy ─────────────
// payload: { network_id, ssid, bssid, channel, encryption_type, ap_password?, ap_status }
export const toggleAP = (payload) =>
  api.post("/device/enable-ap", payload);

// ─── Portal Patch → portal/patch via backend proxy ───────────────
// payload: { network_id, bssid, ssid, announcement_text?, terms_text?, terms_version? }
export const patchPortal = (payload) =>
  api.post("/device/portal-patch", payload);

// ─── Network Config (for AP panel display) ───────────────────────
export const getNetworkConfig = (networkId) =>
  api.get(`/rasPi/networks/${networkId}`);
