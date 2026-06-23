// api/samApi.js
import api from "./axios";

export const getThreatDetail = (idOrName) => {
  return api.get(`/sam/threats/${encodeURIComponent(idOrName)}`);
};

export const getVulnerabilityDetail = (idOrName) => {
  return api.get(`/sam/vulnerabilities/${encodeURIComponent(idOrName)}`);
};

export const getNetworksList = () => {
  return api.get(`/rasPi/networks_list/`);
};
