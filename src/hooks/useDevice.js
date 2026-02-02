// hooks/useDevice.js
import { useState, useEffect } from "react";
import { getNetworks, toggleAccessPoint } from "../api/rasPiApi";

export const useDevice = () => {
  const [accessPoint, setAccessPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAccessPoint = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await getNetworks(); // GET /rasPi/networks
        const data = res.data;

        const formattedAccessPoint = {
          currentNetwork: data[0].SSID,
          accessPointNetwork: data[0].SSID,
          status: data[0].Status,
          connectedClients: null, // TODO
          enabled: null, // TODO
        };

        setAccessPoint(formattedAccessPoint);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to fetch access point info");
      } finally {
        setLoading(false);
      }
    };

    fetchAccessPoint();
  }, []);

  const handleToggleAccessPoint = async () => {
    if (!accessPoint) return;

    const nextState = !accessPoint.enabled;

    try {
      setLoading(true);
      setError(null);

      setAccessPoint((prev) => ({
        ...prev,
        enabled: nextState,
        status: nextState ? "Active" : "Disabled",
      }));

      await toggleAccessPoint(nextState);
    } catch (err) {
      console.error("Toggle AP failed:", err);
      setError(err.message || "Failed to toggle access point");
    } finally {
      setLoading(false);
    }
  };

  return {
    accessPoint,
    loading,
    error,
    handleToggleAccessPoint,
  };
};
