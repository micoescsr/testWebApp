// context/ThreatDetectionContext.jsx
// Global threat-detection state — single polling loop for the entire app.
// Consumers (Sidebar, SAM page, etc.) read from this context; none start their own polling.

import { createContext, useContext, useState, useEffect } from "react";
import { useThreatDetection } from "../hooks/useSAM";
import { useSessionState } from "../hooks/useSessionState";

const ThreatDetectionContext = createContext(null);

/** Human-readable relative time from a millisecond timestamp. */
export const timeAgo = (ts) => {
  if (!ts) return "";
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};

export const ThreatDetectionProvider = ({ children }) => {
  const detection = useThreatDetection();
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  // Persist activeNetwork in sessionStorage so it survives page refreshes.
  // Cleared on logout via clearSessionState() (wipes all wf:* keys).
  const [activeNetworkOverride, setActiveNetworkOverride] = useSessionState(
    "wf:activeNetwork",
    null,
  );

  // Bump lastUpdated whenever detection status or poll results change
  useEffect(() => {
    setLastUpdated(Date.now());
  }, [detection.detectionStatus, detection.detectionResults]);

  // Sync activeNetwork from backend state whenever it changes.
  // Backend is the authoritative source for which network is being monitored.
  // Session storage acts as a fast cache for initial render before the
  // bootstrap /detect/status call resolves.
  useEffect(() => {
    const ssid = detection.backendState?.ssid;
    if (ssid && ssid !== activeNetworkOverride) {
      setActiveNetworkOverride(ssid);
    }
  }, [detection.backendState?.ssid, activeNetworkOverride, setActiveNetworkOverride]);

  // Resolved activeNetwork: backend truth first, session cache as fallback
  const resolvedActiveNetwork =
    detection.backendState?.ssid || activeNetworkOverride || null;

  const value = {
    detectionStatus: detection.detectionStatus,
    setDetectionStatus: detection.setDetectionStatus,
    detectionResults: detection.detectionResults,
    liveThreats: detection.liveThreats,
    displayThreats: detection.displayThreats,
    failureReason: detection.failureReason,
    shouldShowDetectionError: detection.shouldShowDetectionError,
    markScanStarted: detection.markScanStarted,
    backendState: detection.backendState,
    refreshStatus: detection.refreshStatus,
    resetDetection: detection.resetDetection,
    lastUpdated,
    activeNetwork: resolvedActiveNetwork,
    setActiveNetwork: setActiveNetworkOverride,
  };

  return (
    <ThreatDetectionContext.Provider value={value}>
      {children}
    </ThreatDetectionContext.Provider>
  );
};

export const useThreatDetectionContext = () => {
  const ctx = useContext(ThreatDetectionContext);
  if (!ctx) {
    throw new Error(
      "useThreatDetectionContext must be used within ThreatDetectionProvider",
    );
  }
  return ctx;
};
