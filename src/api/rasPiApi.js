// api/rasPiApi.js
import api from "./axios";

// GET access point details
export const getNetworks = () => {
  return api.get("/rasPi/networks");
};

// POST metadata from rasPi
export const sendMetadata = (payload) => {
  return api.post("/rasPi/networks", payload);
};

// Trigger scan for a selected network
export const triggerScan = async (ssid, bssid, channel) => {
  const res = await api.post("/scan", {
    ssid, 
    bssid,
    channel
  });
  return res.data;
};

export const toggleAccessPoint = async (toggleState) => {
  const res = await api.post("/rasPi_scan/signal_ap", {
    toggleState,
  });

  console.log("Toggle AP response data:", res.data);
  return res.data;
};
