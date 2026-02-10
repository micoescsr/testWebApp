// api/samHistoryApi.js
import api from "./axios";


// api/samHistoryApi.js
export const getVulnHistory = () => api.get("/history/vulnerabilities");
export const getThreatHistory = () => api.get("/history/threats");
