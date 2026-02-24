// hooks/useDevice.js - DB-driven AP state + scan validation
import { useState, useEffect, useCallback } from "react";
import { toggleAP, getApState, getNetworkConfig } from "../api/deviceApi";

export const useDevice = (networkId, scanId) => {
  // Network config fetched from DB (display only — never sent to enable-ap)
  const [networkConfig, setNetworkConfig] = useState({
    ssid: "",
    bssid: "",
    channel: "",
    encryption_type: "",
  });

  // AP state from DB (source of truth)
  const [apEnabled, setApEnabled] = useState(false);
  const [portalInitialized, setPortalInitialized] = useState(false);

  // UI states
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanError, setScanError] = useState(null); // SCAN_REQUIRED, SCAN_TOO_OLD, etc.

  // ─── Fetch network config from Supabase ──────────────────────
  const fetchNetworkConfig = useCallback(async () => {
    if (!networkId) return;
    try {
      setConfigLoading(true);
      setError(null);
      const res = await getNetworkConfig(networkId);
      setNetworkConfig(res.data);
    } catch (err) {
      console.error("fetchNetworkConfig error:", err);
      setError("Failed to load network configuration.");
    } finally {
      setConfigLoading(false);
    }
  }, [networkId]);

  // ─── Fetch AP state from DB (source of truth) ────────────────
  const fetchApState = useCallback(async () => {
    if (!networkId) return;
    try {
      const res = await getApState(networkId);
      setApEnabled(res.data.ap_enabled ?? false);
      setPortalInitialized(res.data.portal_initialized ?? false);
    } catch (err) {
      console.error("fetchApState error:", err);
      // Non-fatal: default to disabled
    }
  }, [networkId]);

  useEffect(() => {
    fetchNetworkConfig();
    fetchApState();
    setScanError(null);
  }, [fetchNetworkConfig, fetchApState]);

  // ─── Toggle AP → sends only IDs + password to backend ────────
  const handleToggleAccessPoint = async (apPassword = "") => {
    const nextState = !apEnabled;
    const apStatus = nextState ? "enable" : "disable";

    // Clear previous scan errors
    setScanError(null);

    // Optimistic UI flip
    setApEnabled(nextState);
    setLoading(true);
    setError(null);

    try {
      const payload = {
        network_id: networkId,
        ap_status: apStatus,
        ...(apPassword && { ap_password: apPassword }),
        // scan_id only needed for enable
        ...(nextState && scanId && { scan_id: scanId }),
      };

      console.log(`Sending enable-ap (${apStatus}):`, payload);
      const res = await toggleAP(payload);
      console.log("enable-ap response:", res.data);

      // Refresh AP state from DB after success
      await fetchApState();
    } catch (err) {
      console.error("AP toggle failed:", err);
      const backendError = err?.response?.data?.error;

      // Revert optimistic toggle on failure
      setApEnabled(!nextState);

      if (backendError === "SCAN_REQUIRED") {
        setScanError("SCAN_REQUIRED");
      } else if (backendError === "SCAN_TOO_OLD") {
        setScanError("SCAN_TOO_OLD");
        // Include extra detail from backend
        setError(err?.response?.data?.message || "Scan is too old. Run a new scan.");
      } else if (backendError === "SCAN_NETWORK_MISMATCH") {
        setScanError("SCAN_NETWORK_MISMATCH");
        setError("Scan does not match this network. Run a new scan.");
      } else {
        setError("Failed to toggle access point. Check device connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Effective access-point object for the panel ──────────────
  const effectiveAccessPoint = apEnabled
    ? {
        currentNetwork: networkConfig.ssid || "N/A",
        accessPointNetwork: networkConfig.ssid || "N/A",
        status: "Active",
        connectedClients: "N/A",
        enabled: true,
      }
    : {
        currentNetwork: networkConfig.ssid || "N/A",
        accessPointNetwork: networkConfig.ssid || "N/A",
        status: "Disabled",
        connectedClients: "N/A",
        enabled: false,
      };

  return {
    accessPoint: effectiveAccessPoint,
    networkConfig,
    apEnabled,
    portalInitialized,
    loading,
    configLoading,
    error,
    scanError,        // "SCAN_REQUIRED" | "SCAN_TOO_OLD" | "SCAN_NETWORK_MISMATCH" | null
    hasScanId: !!scanId,
    refetch: fetchNetworkConfig,
    handleToggleAccessPoint,
  };
};
