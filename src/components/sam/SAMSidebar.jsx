// components/sam/SAMSidebar.jsx
import { useState, useMemo } from "react";

const SAMSidebar = ({
  selectedNetwork,
  lastScannedNetwork, // NEW for sidebar display
  onSelectNetwork,
  availableNetworks,
  onScan,
  networksLoading,   // NEW
  networksError,     // NEW
  lastScan, // NEW for scan display scan_end
  locationMeta,
  onChangeMeta,
}) => {

  /* const lastScanLabel = lastScan
    ? lastScan.scan_end          // or format with new Date(...)
    : "N/A"; */

  // helper for formatting to Asia/Manila
  const formatLastScan = (scan) => {
    if (!scan?.scan_end) return null;
    const d = new Date(scan.scan_end);
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  };

  const lastScanLabel = formatLastScan(lastScan);

  // --- Network search filter ---
  const [networkSearch, setNetworkSearch] = useState("");

  const filteredNetworks = useMemo(() => {
    if (!availableNetworks) return [];
    if (!networkSearch.trim()) return availableNetworks;
    const q = networkSearch.toLowerCase();
    return availableNetworks.filter(
      (net) =>
        (net.ssid && net.ssid.toLowerCase().includes(q)) ||
        (net.bssid && net.bssid.toLowerCase().includes(q))
    );
  }, [availableNetworks, networkSearch]);

  return (
    <div className="sam-sidebar">
      <div className="sidebar-section">
        <div className="info-row">
          <span className="info-label">Current Network</span>
          <span className="info-value">
            {lastScannedNetwork 
              ? lastScannedNetwork.ssid || "(hidden)"
              : "N/A"}
              
            {/* with bssid 
            {selectedNetwork? `${selectedNetwork.ssid || "(hidden)"} (${selectedNetwork.bssid})`: "N/A"}  */}
          </span>
          
        </div>
        <div className="info-row">
          <span className="info-label">Last Scan</span>
          <span className="info-value">
            {lastScanLabel || "N/A"}
          </span>
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-title">Available Networks</h3>

          {networksLoading && <div className="info-value">Loading...</div>}
          {networksError && <div className="info-value error">{networksError}</div>}
        {!networksLoading && !networksError && (
          <>
            <input
              type="text"
              className="network-search"
              placeholder="Search networks..."
              value={networkSearch}
              onChange={(e) => setNetworkSearch(e.target.value)}
            />
        <div className="network-list">
        
          {filteredNetworks.length > 0 ? (
              filteredNetworks.map((net, idx) => (
                <div
                  key={`${net.bssid || net.ssid}-${idx}`} //using bssid as the main identifier, but adds the index so React never sees the same key string twice, even if your data unexpectedly has duplicates or missing BSSIDs.
                  className={`network-item ${
                    selectedNetwork && selectedNetwork.bssid === net.bssid ? "active" : ""
                  }`}
                  onClick={() => onSelectNetwork(net)}
                >
                  {net.ssid || "(hidden)"} 
                  {/* {net.ssid || "(hidden)"} ({net.bssid}) --with bssid */}
                </div>
              ))
            ) : (
              <div className="network-item">
                {networkSearch ? "No matching networks" : "No networks found"}
              </div>
            )}
          </div>
          </>
        )}

      {/*         <div className="network-list">
          {availableNetworks.map((network, index) => (
            <div
              key={index}
              className={`network-item ${
                selectedNetwork === network ? "active" : ""
              }`}
              onClick={() => onSelectNetwork(network)}
            >
              {network}
            </div>
          ))}
        </div> */}
      </div>

      <div className="sidebar-section">
        <div className="section-header">
          <h3 className="sidebar-title">Network Details</h3>
          <button className="edit-btn">✏️</button>
        </div>
        <div className="network-form">
          <input type="text" placeholder="City" className="form-input"
            value={locationMeta.city}
            onChange={(e) => onChangeMeta("city", e.target.value)} />
          <input type="text" placeholder="Province" className="form-input" 
            value={locationMeta.province}
            onChange={(e) => onChangeMeta("province", e.target.value)} />
          <textarea
            placeholder="Notes (e.g. SM Mall)"
            className="form-textarea"
            rows="4"
           value={locationMeta.notes}
            onChange={(e) => onChangeMeta("notes", e.target.value)}
          ></textarea>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="action-btn primary" onClick={onScan}>
          + Scan Now
        </button>
      </div>
    </div>
  );
};

export default SAMSidebar;
