// src/api/deviceApi.js - network_id + scan_id aware; backend owns all config
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
});

// ─── Announcement (per-network) ──────────────────────────────────
export const getAnnouncement = (networkId) =>
  api.get(`/captivePortal/announcement?network_id=${networkId}`);
export const getAnnouncementHistory = (networkId) =>
  api.get(`/captivePortal/announcement/history?network_id=${networkId}`);
export const publishAnnouncement = (content, networkId) =>
  api.post("/captivePortal/announcement", { content, network_id: networkId });

// ─── Terms & Conditions (per-network) ────────────────────────────
export const getTerms = (networkId) =>
  api.get(`/captivePortal/terms?network_id=${networkId}`);
export const getTermsHistory = (networkId) =>
  api.get(`/captivePortal/terms/history?network_id=${networkId}`);
export const publishTerms = (content, version, networkId) =>
  api.post("/captivePortal/terms", { content, version, network_id: networkId });

// ─── Tips (per-network) ─────────────────────────────────────────
export const getTips = (networkId) =>
  api.get(`/captivePortal/tips?network_id=${networkId}`);
export const upsertTips = (tips, networkId) =>
  api.post("/captivePortal/tips", { tips, network_id: networkId });

// ─── Risk Classification ─────────────────────────────────────────
export const getRiskClassifications = () =>
  api.get("/captivePortal/risk-classifications");

// ─── Portal Summary & Sync ──────────────────────────────────────
export const getPortalSummary = (networkId, score) =>
  api.get(`/captivePortal/summary?network_id=${networkId}&score=${score || 0}`);
export const syncPortal = (networkId, score) =>
  api.post("/captivePortal/sync", { network_id: networkId, score: score || 0 });

// ─── AP Toggle → backend validates scan + loads config from DB ───
// payload: { network_id, scan_id?, ap_status: "enable"|"disable", ap_password? }
//   scan_id required for enable only
export const toggleAP = (payload) =>
  api.post("/device/enable-ap", payload);

// ─── AP State from DB (source of truth) ──────────────────────────
export const getApState = (networkId) =>
  api.get(`/device/ap-state/${networkId}`);

// ─── Network Config ──────────────────────────────────────────────
export const getNetworkConfig = (networkId) =>
  api.get(`/rasPi/networks/${networkId}`);

// ─── Admin State (authoritative AP + scan + portal + risk) ───────
export const getNetworkState = (networkId) =>
  api.get(`/device/network/${networkId}/state`);

// ─── Network Config (for AP panel display) ───────────────────────
export const getNetworkConfig = (networkId) =>
  api.get(`/rasPi/networks/${networkId}`);
