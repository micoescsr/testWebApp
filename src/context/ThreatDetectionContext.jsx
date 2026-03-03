// context/ThreatDetectionContext.jsx
// Global threat-detection state — single polling loop for the entire app.
// Consumers (Sidebar, SAM page, etc.) read from this context; none start their own polling.

import { createContext, useContext, useState, useEffect } from "react";
import { useThreatDetection } from "../hooks/useSAM";

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
  const [activeNetworkOverride, setActiveNetworkOverride] = useState(null);

  // Bump lastUpdated whenever detection status or poll results change
  useEffect(() => {
    setLastUpdated(Date.now());
  }, [detection.detectionStatus, detection.detectionResults]);

  const value = {
    detectionStatus: detection.detectionStatus,
    setDetectionStatus: detection.setDetectionStatus,
    detectionResults: detection.detectionResults,
    liveThreats: detection.liveThreats,
    displayThreats: detection.displayThreats,
    failureReason: detection.failureReason,
    backendState: detection.backendState,
    refreshStatus: detection.refreshStatus,
    resetDetection: detection.resetDetection,
    lastUpdated,
    activeNetwork:
      activeNetworkOverride || detection.backendState?.ssid || null,
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
