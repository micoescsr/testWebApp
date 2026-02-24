// context/NetworkContext.jsx
// In-memory store for the current network_id after a scan.
// Replaces localStorage so sensitive IDs never touch disk storage.
import { createContext, useContext, useState, useMemo } from "react";

const NetworkContext = createContext({
  networkId: null,
  setNetworkId: () => {},
});

export const NetworkProvider = ({ children }) => {
  const [networkId, setNetworkId] = useState(null);

  const value = useMemo(
    () => ({ networkId, setNetworkId }),
    [networkId]
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetworkContext = () => useContext(NetworkContext);
