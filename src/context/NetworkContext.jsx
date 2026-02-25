// context/NetworkContext.jsx
// Persists network_id + scan_id in sessionStorage so they survive refresh.
// Stored as a single atomic key ("wf:networkScan") to prevent partial writes.
// sessionStorage is tab-scoped and clears on tab close — no disk leakage.
import { createContext, useContext, useMemo, useCallback } from "react";
import { useSessionState } from "../hooks/useSessionState";

const STORAGE_KEY = "wf:networkScan";

const NetworkContext = createContext({
  networkId: null,
  scanId: null,
  setNetworkId: () => {},
  setScanId: () => {},
  setNetworkScan: () => {},
  clearNetworkScan: () => {},
});

export const NetworkProvider = ({ children }) => {
  // Single atomic state: { networkId, scanId }
  const [scan, setScan] = useSessionState(STORAGE_KEY, {
    networkId: null,
    scanId: null,
  });

  const setNetworkId = useCallback(
    (nId) =>
      setScan((prev) => ({
        ...prev,
        networkId: nId ?? null,
        // Reset scanId when network changes to prevent mismatch
        scanId: nId !== prev.networkId ? null : prev.scanId,
      })),
    [setScan]
  );

  const setScanId = useCallback(
    (sId) => setScan((prev) => ({ ...prev, scanId: sId ?? null })),
    [setScan]
  );

  // Convenience: set both at once (used after scan save)
  const setNetworkScan = useCallback(
    (nId, sId) => setScan({ networkId: nId ?? null, scanId: sId ?? null }),
    [setScan]
  );

  // Logout / full reset
  const clearNetworkScan = useCallback(
    () => setScan({ networkId: null, scanId: null }),
    [setScan]
  );

  const value = useMemo(
    () => ({
      networkId: scan.networkId,
      scanId: scan.scanId,
      setNetworkId,
      setScanId,
      setNetworkScan,
      clearNetworkScan,
    }),
    [scan.networkId, scan.scanId, setNetworkId, setScanId, setNetworkScan, clearNetworkScan]
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetworkContext = () => useContext(NetworkContext);
