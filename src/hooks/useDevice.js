// hooks/useDevice.js
import { useState, useEffect, useCallback } from "react";
import { getNetworks, toggleAccessPoint } from "../api/rasPiApi";

export const useDevice = () => {
  // toggle state of AP itself
  const [apEnabled, setApEnabled] = useState(false);     // default: disabled

  // info state (only relevant when enabled)
  const [accessPoint, setAccessPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const fetchAccessPoint = useCallback(async () => {
    if (!apEnabled) {
      // if AP is disabled, do NOT call backend at all
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setIsEmpty(false);

      const res = await getNetworks(); // GET /rasPi/networks
      const data = res.data;

      if (!data || data.length === 0) {
        // AP enabled but no network configured
        setIsEmpty(true);
        setAccessPoint(null);
        return;
      }

      const formattedAccessPoint = {
        currentNetwork: data[0].SSID ?? "N/A",
        accessPointNetwork: data[0].SSID ?? "N/A",
        status: data[0].Status ?? "Active",
        connectedClients: data[0].ConnectedClients ?? "N/A",
        enabled: true,
      };

      setAccessPoint(formattedAccessPoint);
    } catch (err) {
      console.error("getNetworks failed:", err);
      const status = err?.response?.status;

      if (status === 404) {
    setIsEmpty(true);
    // keep accessPoint as-is (enabled) or set a minimal enabled object
    setAccessPoint((prev) => ({
      currentNetwork: "N/A",
      accessPointNetwork: "N/A",
      status: "Active",
      connectedClients: "N/A",
      enabled: true,
    }));
    setError(null);
  } else if (status >= 500 && status < 600) {
    setError("Unable to connect to the device network. Please try again.");
    // do NOT setAccessPoint(null) here
      } else {
        setError("Access point info is currently unavailable.");
        setAccessPoint(null);
        setIsEmpty(false);
      }
    } finally {
      setLoading(false);
    }
  }, [apEnabled]);

  // only refetch when AP is enabled and we explicitly call refetch
  useEffect(() => {
    if (apEnabled) {
      fetchAccessPoint();
    } else {
      // when disabled, clear info/error states
      setAccessPoint(null);
      setError(null);
      setIsEmpty(false);
      setLoading(false);
    }
  }, [apEnabled, fetchAccessPoint]);

  const handleToggleAccessPoint = async () => {
  const nextState = !apEnabled;

  // 1) Optimistically flip the local toggle
  setApEnabled(nextState);

  // 2) Immediately reflect that in accessPoint so the UI moves
  setAccessPoint((prev) => ({
    currentNetwork: prev?.currentNetwork ?? "N/A",
    accessPointNetwork: prev?.accessPointNetwork ?? "N/A",
    status: nextState ? "Active" : "Disabled",
    connectedClients: prev?.connectedClients ?? "N/A",
    enabled: nextState,
  }));

  try {
    setLoading(true);
    setError(null);

    const res = await toggleAccessPoint(nextState);
    console.log("Toggle AP response data:", res.data);

    // 3) If enabling, try to load real info (may 500, that’s fine)
    if (nextState) {
      await fetchAccessPoint();
    }
  } catch (err) {
    console.error("Toggle AP failed:", err);
    setError("Failed to contact the device. Access point state may be stale.");
    // IMPORTANT: do NOT revert apEnabled here, we keep the UI as-is
  } finally {
    setLoading(false);
  }
};

  // when disabled, we still want to show a disabled panel (not "empty")
  const effectiveAccessPoint =
    apEnabled && accessPoint
      ? { ...accessPoint, enabled: true }
      : { currentNetwork: "N/A", accessPointNetwork: "N/A", status: "Disabled", connectedClients: "N/A", enabled: false };

  return {
    accessPoint: effectiveAccessPoint,
    apEnabled,
    loading,
    error,
    isEmpty,
    refetch: fetchAccessPoint,
    handleToggleAccessPoint,
  };
};
