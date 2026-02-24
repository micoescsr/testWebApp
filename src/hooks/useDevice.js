// hooks/useDevice.js - orchestrate/apply + portal/patch flow
import { useState, useEffect, useCallback } from "react";
import { toggleAP, patchPortal, getNetworkConfig } from "../api/deviceApi";

export const useDevice = (networkId) => {
  // AP toggle state
  const [apEnabled, setApEnabled] = useState(false);

  // Network config fetched from DB
  const [networkConfig, setNetworkConfig] = useState({
    ssid: "",
    bssid: "",
    channel: "",
    encryption_type: "",
  });

  // UI states
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);

  // Track whether portal/patch has been sent for this session
  const [portalInitialized, setPortalInitialized] = useState(false);

  // ─── Fetch network config from Supabase via rasPi/networks/:id ──
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

  useEffect(() => {
    fetchNetworkConfig();
    // Reset AP state when network changes (user did a new scan)
    setApEnabled(false);
    setPortalInitialized(false);
  }, [fetchNetworkConfig]);

  // ─── Toggle AP → orchestrate/apply + portal/patch on first enable ──
  const handleToggleAccessPoint = async (apPassword = "") => {
    const nextState = !apEnabled;
    const apStatus = nextState ? "enable" : "disable";

    // Optimistically flip UI
    setApEnabled(nextState);
    setLoading(true);
    setError(null);

    try {
      // 1. Call orchestrate/apply (enable or disable)
      const orchestratePayload = {
        network_id: networkId,
        ssid: networkConfig.ssid,
        bssid: networkConfig.bssid,
        channel: networkConfig.channel,
        encryption_type: networkConfig.encryption_type,
        ap_status: apStatus,
        ...(apPassword && { ap_password: apPassword }),
      };

      console.log(`Sending orchestrate/apply (${apStatus}):`, orchestratePayload);
      const apRes = await toggleAP(orchestratePayload);
      console.log("orchestrate/apply response:", apRes.data);

      // 2. If enabling for the first time, also send portal/patch (hardcoded content)
      if (nextState && !portalInitialized) {
        console.log("First AP enable – sending portal/patch...");
        const portalRes = await patchPortal({
          network_id: networkId,
          bssid: networkConfig.bssid,
          ssid: networkConfig.ssid,
        });
        console.log("portal/patch response:", portalRes.data);
        setPortalInitialized(true);
      }
    } catch (err) {
      console.error("AP toggle failed:", err);
      setError("Failed to toggle access point. Check device connection.");
      // Keep UI in attempted state so user sees what happened
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
    loading,
    configLoading,
    error,
    isEmpty,
    refetch: fetchNetworkConfig,
    handleToggleAccessPoint,
  };
};
