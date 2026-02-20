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

// api/rasPiApi.js
export const triggerScan = async (network) => {  // Pass full network object
  console.log('triggerScan payload:', network);  // Debug
  const res = await api.post("/rasPi/scan", {
    ssid: network.ssid,
    bssid: network.bssid,
    channel: parseInt(network.channel)  // Ensure number
  });
  return res.data;
};


export const toggleAccessPoint = async (toggleState) => {
  const res = await api.post("/device/signal_ap", {
    toggleState,
  });

  console.log("Toggle AP response data:", res.data);
  return res.data;
};
