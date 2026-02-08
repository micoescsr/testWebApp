// hooks/useDevice.js
import { useState, useEffect, useCallback } from "react";
import { getNetworks, toggleAccessPoint } from "../api/rasPiApi";

export const useDevice = () => {
  const [accessPoint, setAccessPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAccessPoint = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await getNetworks(); // GET /rasPi/networks
      const data = res.data;

      if (!data || data.length === 0) {
        // treat as N/A, not an error
        setAccessPoint({
          currentNetwork: "N/A",
          accessPointNetwork: "N/A",
          status: "N/A",
          connectedClients: "N/A",
          enabled: false,
        });
        return;
      }

      const formattedAccessPoint = {
        currentNetwork: data[0].SSID ?? "N/A",
        accessPointNetwork: data[0].SSID ?? "N/A",
        status: data[0].Status ?? "N/A",
        connectedClients: null, // TODO
        enabled: null, // TODO
      };

      setAccessPoint(formattedAccessPoint);
    } catch (err) {
      console.error("getNetworks failed:", err);
      const status = err?.response?.status;

      if (status === 404) {
        // treat as "no data" 
        setAccessPoint({
          currentNetwork: "N/A",
          accessPointNetwork: "N/A",
          status: "N/A",
          connectedClients: "N/A",
          enabled: false,
        });
        setError(null);
      } else {
        setError("Access point info is currently unavailable.");
        setAccessPoint(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccessPoint();
  }, [fetchAccessPoint]);

  const handleToggleAccessPoint = async () => {
    if (!accessPoint) return;

    const nextState = !accessPoint.enabled;

    try {
      setLoading(true);
      setError(null);

      setAccessPoint(prev => ({
        ...prev,
        enabled: nextState,
        status: nextState ? "Active" : "Disabled",
      }));

      await toggleAccessPoint(nextState);
    } catch (err) {
      console.error("Toggle AP failed:", err);
      setError("Failed to toggle access point.");
      // revert optimistic update if needed
      setAccessPoint(prev => ({ ...prev, enabled: !nextState }));
    } finally {
      setLoading(false);
    }
  };

  const isEmpty = !loading && !error && !accessPoint;

  return {
    accessPoint,
    loading,
    error,
    isEmpty,
    refetch: fetchAccessPoint,
    handleToggleAccessPoint,
  };
};
