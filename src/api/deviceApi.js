// src/api/deviceApi.js - network_id + scan_id aware; backend owns all config
// Uses the shared axios instance so VITE_API_BASE_URL and Bearer auth work
// in both dev (Vite proxy) and production (Railway).
import api from "./axios";

// ─── Announcement (per-network) ──────────────────────────────────
export const getAnnouncement = (networkId) =>
  api.get(`/captivePortal/announcement?network_id=${networkId}`);
export const getAnnouncementHistory = (networkId) =>
  api.get(`/captivePortal/announcement/history?network_id=${networkId}`);
export const publishAnnouncement = (content, networkId) =>
  api.post("/captivePortal/announcement", { content, network_id: networkId });

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

// ─── Portal Partial Update (client-driven, allowlisted) ──────────
// update_type: 'announcement'|'terms'|'tips'|'risk'|'active'|'bulk'
export const updatePortal = (networkId, updateType, payload, reason = 'manual_update') =>
  api.post('/device/portal/update', {
    network_id: networkId,
    update_type: updateType,
    reason,
    payload,
  });
