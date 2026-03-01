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
      const backendMsg = err?.response?.data?.message;

      // Revert optimistic toggle on failure
      setApEnabled(!nextState);

      // Map all backend error codes to scanError + user-friendly message
      switch (backendError) {
        case "SCAN_REQUIRED":
          setScanError("SCAN_REQUIRED");
          break;
        case "SCAN_NOT_FOUND":
          setScanError("SCAN_NOT_FOUND");
          setError(backendMsg || "Scan not found. Run a new scan first.");
          break;
        case "SCAN_NETWORK_MISMATCH":
          setScanError("SCAN_NETWORK_MISMATCH");
          setError(backendMsg || "Scan does not match this network. Run a new scan.");
          break;
        case "SCAN_NOT_FINISHED":
          setScanError("SCAN_NOT_FINISHED");
          setError(backendMsg || "Scan has not finished yet. Wait for the scan to complete.");
          break;
        case "SCAN_FAILED":
          setScanError("SCAN_FAILED");
          setError(backendMsg || "Scan failed, cancelled, or timed out. Run a new scan.");
          break;
        case "SCAN_HAS_ERRORS":
          setScanError("SCAN_HAS_ERRORS");
          setError(backendMsg || "Last scan completed with errors. Run a new scan.");
          break;
        case "SCAN_INVALID_DATA":
          setScanError("SCAN_INVALID_DATA");
          setError(backendMsg || "Scan finished but contains no data. Run a new scan.");
          break;
        case "SCAN_TOO_OLD":
          setScanError("SCAN_TOO_OLD");
          setError(backendMsg || "Scan is too old. Run a new scan.");
          break;
        case "NETWORK_CONFIG_MISSING":
          setError(backendMsg || "Network configuration is incomplete. Re-scan the network.");
          break;
        case "AP_PASSWORD_REQUIRED":
          setError(backendMsg || "An AP password is required for encrypted networks.");
          break;
        case "AP_PASSWORD_WEAK":
          setError(backendMsg || "AP password must be at least 8 characters.");
          break;
        case "REQUEST_IN_PROGRESS":
          setError("An AP configuration change is already in progress. Please wait.");
          break;
        case "FASTAPI_APPLY_FAILED":
          setError(backendMsg || "Failed to communicate with the device. Try again.");
          break;
        case "PORTAL_PATCH_FAILED":
          setError(backendMsg || "Failed to initialize captive portal. Try again.");
          break;
        case "AP_NOT_ENABLED":
          setError(backendMsg || "AP must be enabled before updating the portal.");
          break;
        case "FASTAPI_PORTAL_PATCH_FAILED":
          setError(backendMsg || "Failed to update captive portal content. Try again.");
          break;
        case "EMPTY_PATCH":
        case "UNSAFE_PATCH_FIELD":
        case "UPDATE_TYPE_MISMATCH":
        case "INVALID_PATCH_SHAPE":
          setError(backendMsg || "Invalid portal update request.");
          break;
        default:
          setError(backendMsg || "Failed to toggle access point. Check device connection.");
          break;
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
