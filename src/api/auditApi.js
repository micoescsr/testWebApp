// src/api/auditApi.js
import api from "./axios";

// GET all audit logs
export const getAuditLogs = () => {
  // Backend endpoint not ready yet
  // return api.get("/audit/logs");

  // TEMPORARY: return null so hook can decide what to do
  return Promise.resolve(null);
};

// CREATE audit log
export const createAuditLog = (payload) => {
  // return api.post("/audit/logs", payload);
  return Promise.resolve(null);
};

// GET audit logs by user
export const getAuditLogsByUser = (userId) => {
  // return api.get(`/audit/logs/user/${userId}`);
  return Promise.resolve(null);
};
