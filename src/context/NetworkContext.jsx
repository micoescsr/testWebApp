// context/NetworkContext.jsx
// In-memory store for network_id + scan_id after a scan.
// Replaces localStorage so sensitive IDs never touch disk storage.
import { createContext, useContext, useState, useMemo } from "react";

const NetworkContext = createContext({
  networkId: null,
  scanId: null,
  setNetworkId: () => {},
  setScanId: () => {},
  setNetworkScan: () => {},
});

export const NetworkProvider = ({ children }) => {
  const [networkId, setNetworkId] = useState(null);
  const [scanId, setScanId] = useState(null);

  // Convenience: set both at once (used after scan save)
  const setNetworkScan = (nId, sId) => {
    setNetworkId(nId);
    setScanId(sId);
  };

  const value = useMemo(
    () => ({ networkId, scanId, setNetworkId, setScanId, setNetworkScan }),
    [networkId, scanId]
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetworkContext = () => useContext(NetworkContext);
