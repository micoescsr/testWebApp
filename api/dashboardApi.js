// api/dashboardApi.js
import api from "./axios";

// Summary (all networks aggregated)
export const getDashboardSummary = () => {
  // e.g. GET /dashboard/summary
  return api.get("/dashboard/summary");
};

// Per‑network dashboard data
export const getDashboardForNetwork = (ssid, params) => {
  // e.g. GET /dashboard/network?ssid=Nacho_WiFi&date=...
  return api.get("/dashboard/network", {
    params: { ssid, ...params },
  });
};
