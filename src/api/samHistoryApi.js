// api/samHistoryApi.js
import api from "./axios";

// Vulnerability scan history per run / per SSID
export const getVulnHistory = () => {
  // Expected backend route: GET /sam/history/vulnerabilities
  return api.get("/sam/history/vulnerabilities");
};

// Threat scan history per run / per SSID
export const getThreatHistory = () => {
  // Expected backend route: GET /sam/history/threats
  return api.get("/sam/history/threats");
};
