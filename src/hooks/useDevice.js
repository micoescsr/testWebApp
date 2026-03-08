// hooks/useDevice.js - DB-driven AP state + admin state from /network/:id/state
import { useState, useEffect, useCallback, useRef } from "react";
import { toggleAP, getNetworkConfig, getNetworkState, updatePortal } from "../api/deviceApi";

const STATE_POLL_INTERVAL = 12_000; // 12 seconds — just inside 15s portal cooldown

export const useDevice = (networkId, scanId) => {
  // Network config fetched from DB (display only — never sent to enable-ap)
  const [networkConfig, setNetworkConfig] = useState({
    ssid: "",
    bssid: "",
    channel: "",
    encryption_type: "",
  });

  // Admin state from /network/:id/state (source of truth)
  const [adminState, setAdminState] = useState(null);
  const [apEnabled, setApEnabled] = useState(false);
  const [portalInitialized, setPortalInitialized] = useState(false);

  // UI states
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanError, setScanError] = useState(null);

  // Timeout reconciliation state
  const [isReconcilingToggle, setIsReconcilingToggle] = useState(false);
  const reconcilingTimersRef = useRef([]);
  const mountedRef = useRef(true);

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

  // ─── Fetch admin state (replaces old getApState) ─────────────
  const fetchAdminState = useCallback(async () => {
    if (!networkId) return;
    try {
      const res = await getNetworkState(networkId);
      const s = res.data;
      setAdminState(s);
      setApEnabled(s.ap_enabled ?? false);
      setPortalInitialized(s.portal_initialized ?? false);
    } catch (err) {
      console.error("fetchAdminState error:", err);
      // Non-fatal: default to disabled
    }
  }, [networkId]);

  // On mount: fetch config + admin state
  useEffect(() => {
    fetchNetworkConfig();
    fetchAdminState();
    setScanError(null);
  }, [fetchNetworkConfig, fetchAdminState]);

  // Cleanup reconciliation timers on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      reconcilingTimersRef.current.forEach(t => clearTimeout(t));
      reconcilingTimersRef.current = [];
    };
  }, []);

  // ─── Low-frequency poll when AP is enabled ───────────────────
  // Keeps risk badge, portal_out_of_date, and scan freshness current
  // without requiring user interaction. Stops when AP is off or unmounted.
  const pollRef = useRef(null);

  useEffect(() => {
    // Clear any existing interval first
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    // Suspend normal polling during timeout reconciliation
    if (apEnabled && networkId && !isReconcilingToggle) {
      pollRef.current = setInterval(() => {
        fetchAdminState();
      }, STATE_POLL_INTERVAL);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [apEnabled, networkId, fetchAdminState, isReconcilingToggle]);

  // ─── Portal update helper (for "Update Portal" button) ───────
  const handleUpdatePortal = async () => {
    if (!networkId || !apEnabled) return;
    try {
      setLoading(true);
      setError(null);
      const bucket = adminState?.risk_state?.risk_bucket || "LOW";
      // User-triggered → reason='manual_update'; risk-only patch
      await updatePortal(networkId, "risk", { risk: { bucket } }, "manual_update");
      await fetchAdminState();
    } catch (err) {
      console.error("Portal update failed:", err);
      const backendMsg = err?.response?.data?.message;
      setError(backendMsg || "Failed to update portal.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Bounded reconciliation after gateway timeout ─────────────
  // Schedule: 3s, 10s, 20s, 35s, 50s, 60s — covers the 45s nginx
  // timeout window plus backend-side reconciliation settling time.
  // Uses ap_apply_in_progress as the settlement gate: only when the
  // backend clears the lock can ap_enabled be trusted as final truth.
  const RECONCILE_SCHEDULE_MS = [3_000, 10_000, 20_000, 35_000, 50_000, 60_000];

  const waitForAdminStateSettlement = (targetApEnabled) => {
    reconcilingTimersRef.current.forEach(t => clearTimeout(t));
    reconcilingTimersRef.current = [];

    setIsReconcilingToggle(true);
    setError(null);
    setScanError(null);

    let settled = false;

    const checkSettlement = async (isLastPoll) => {
      if (!mountedRef.current || settled) return;

      try {
        const stateRes = await getNetworkState(networkId);
        if (!mountedRef.current || settled) return;

        const s = stateRes.data;
        setAdminState(s);
        setApEnabled(s.ap_enabled ?? false);
        setPortalInitialized(s.portal_initialized ?? false);

        if (!s.ap_apply_in_progress) {
          // Backend has settled — ap_enabled is now trustworthy
          settled = true;
          reconcilingTimersRef.current.forEach(t => clearTimeout(t));
          reconcilingTimersRef.current = [];

          const actualEnabled = s.ap_enabled ?? false;
          if (actualEnabled !== targetApEnabled) {
            setError(
              targetApEnabled
                ? "The access point did not finish enabling. Please try again."
                : "The access point did not finish disabling. Please try again."
            );
          }
          setIsReconcilingToggle(false);
          return;
        }

        // ap_apply_in_progress still true — backend not settled yet
        if (isLastPoll) {
          settled = true;
          setError(
            "The device may still be processing the request. Please wait a moment, then refresh or try again."
          );
          setIsReconcilingToggle(false);
        }
      } catch {
        if (!mountedRef.current || settled) return;
        if (isLastPoll) {
          settled = true;
          setError(
            "The device may still be processing the request. Please wait a moment, then refresh or try again."
          );
          setIsReconcilingToggle(false);
        }
      }
    };

    RECONCILE_SCHEDULE_MS.forEach((delayMs, idx) => {
      const isLast = idx === RECONCILE_SCHEDULE_MS.length - 1;
      const timerId = setTimeout(() => checkSettlement(isLast), delayMs);
      reconcilingTimersRef.current.push(timerId);
    });
  };

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

      // Backend may have reconciled after a timeout — Pi succeeded despite proxy timeout
      if (res.data?.reconciled) {
        setApEnabled(res.data.ap_enabled);
        await fetchAdminState();
        if (!res.data.ap_enabled && nextState) {
          setError("Request timed out and the AP did not turn on. Please try again.");
        }
        return;
      }

      // Refresh admin state from DB after success
      await fetchAdminState();
    } catch (err) {
      console.error("AP toggle failed:", err);
      const httpStatus = err?.response?.status;
      const backendError = err?.response?.data?.error;
      const backendMsg = err?.response?.data?.message || err?.response?.data?.user_message;

      // Gateway/transport timeout — ambiguous outcome, enter bounded reconciliation.
      // Do NOT revert optimistic toggle or claim hard failure; let the reconciliation
      // polling determine backend truth via ap_apply_in_progress settlement gate.
      if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
        waitForAdminStateSettlement(nextState);
        return;
      }

      // Non-timeout failure: revert optimistic toggle and refresh state
      setApEnabled(!nextState);
      await fetchAdminState();

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
        case "PASSWORD_REQUIRED":
          setError("Password is required for this network.");
          break;
        case "AP_PASSWORD_WEAK":
          setError(backendMsg || "AP password must be at least 8 characters.");
          break;
        case "INCORRECT_PASSWORD":
          setError("Incorrect Wi-Fi password. Please check and try again.");
          break;
        case "SSID_NOT_FOUND":
          setError("Network SSID could not be found. The network may be out of range.");
          break;
        case "ENCRYPTION_MISMATCH":
          setScanError("ENCRYPTION_MISMATCH");
          setError("Network security type has changed. Run a new scan.");
          break;
        case "NETWORK_DATA_OUTDATED":
          setScanError("NETWORK_DATA_OUTDATED");
          setError("Network details are outdated. Run a new scan.");
          break;
        case "PI_NETWORK_CONFLICT":
          setError("Cannot connect — this network conflicts with the Pi's management network.");
          break;
        case "DEVICE_BUSY":
          setError("Device is busy. Please wait and try again.");
          break;
        case "DEVICE_EXCEPTION":
          setError(backendMsg || "An internal device error occurred. Please try again.");
          break;
        case "INVALID_PAYLOAD":
          setError("Details are incomplete. Please check your configuration.");
          break;
        case "CONNECTION_FAILED":
          setError("Couldn't connect to the uplink network. Please try again.");
          break;
        case "UPLINK_DISCONNECTED":
          setError("Uplink disconnected. Access point is off.");
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
        case "ORCHESTRATE_ERROR":
          setError(backendMsg || "An unexpected device error occurred. Please try again.");
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
    adminState,       // full admin state object from /network/:id/state
    loading,
    configLoading,
    error,
    scanError,
    hasScanId: !!scanId,
    isReconcilingToggle,
    refetch: fetchNetworkConfig,
    refetchState: fetchAdminState,
    handleToggleAccessPoint,
    handleUpdatePortal,
  };
};
