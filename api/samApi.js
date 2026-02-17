// api/samApi.js
import api from "./axios";

export const getThreats = () => {
  return api.get("/sam/threats");
};

export const getVulnerabilities = () => {
  return api.get("/sam/vulnerabilities");
};

export const getThreatDetail = (idOrName) => {
  return api.get(`/sam/threats/${encodeURIComponent(idOrName)}`);
};

export const getVulnerabilityDetail = (idOrName) => {
  return api.get(`/sam/vulnerabilities/${encodeURIComponent(idOrName)}`);
};


/* // api/samApi.js
import api from "./axios";

export const getThreats = () => api.get("/sam/threats");
export const getVulnerabilities = () => api.get("/sam/vulnerabilities");

// optional detail endpoints for future DB data
export const getThreatDetail = (idOrName) =>
  api.get(`/sam/threats/${encodeURIComponent(idOrName)}`);

export const getVulnerabilityDetail = (idOrName) =>
  api.get(`/sam/vulnerabilities/${encodeURIComponent(idOrName)}`); */
