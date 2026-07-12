// api/dashboardApi.js
import api from "./axios";

// Summary (all networks aggregated).
// Optional asOfDate (YYYY-MM-DD) → historical summary: latest completed scan
// per network as of the end of that date. Omitted → latest summary.
export const getDashboardSummary = (asOfDate) => {
  const params = {};
  if (asOfDate) params.asOf = asOfDate;
  return api.get("/dashboard/summary", { params });
};

// Per-network dashboard data (optional scanId for date filter)
export const getDashboardForNetwork = (networkId, scanId) => {
  const params = {};
  if (scanId) params.scanId = scanId;
  return api.get(`/dashboard/network/${networkId}`, { params });
};

// Network list (for dropdown)
export const getNetworks = () => {
  return api.get("/dashboard/networks");
};

// Scan list for a network (for date dropdown)
export const getScansForNetwork = (networkId) => {
  return api.get(`/dashboard/network/${networkId}/scans`);
};
