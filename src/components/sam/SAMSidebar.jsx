// components/sam/SAMSidebar.jsx
import { useState, useMemo } from "react";

const SAMSidebar = ({
  selectedNetwork,
  lastScannedNetwork, // NEW for sidebar display
  onSelectNetwork,
  availableNetworks,
  onScan,
  networksLoading,
  networksError,
  onRefreshNetworks,
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
        <div className="section-header">
          <h3 className="sidebar-title">Available Networks</h3>
          <button
            className="refresh-btn"
            onClick={onRefreshNetworks}
            disabled={networksLoading}
            title="Refresh network list"
            type="button"
          >
            <svg
              className={`refresh-icon${networksLoading ? " spinning" : ""}`}
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6" />
              <path d="M2.5 22v-6h6" />
              <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" />
              <path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
            </svg>
          </button>
        </div>

          {networksLoading && <div className="info-value">Loading...</div>}
          {networksError && <div className="info-value error">{networksError}</div>}
        {!networksLoading && !networksError && (
          <>
            <div className="network-search-wrapper">
              <svg
                className="search-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="network-search"
                placeholder="Search networks..."
                value={networkSearch}
                onChange={(e) => setNetworkSearch(e.target.value)}
              />
              {networkSearch && (
                <button
                  className="clear-search-btn"
                  onClick={() => setNetworkSearch("")}
                  type="button"
                  aria-label="Clear search"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
              <div className="network-list">
          {filteredNetworks.length > 0 ? (
            filteredNetworks.map((net, idx) => (
              <div
                key={`${net.bssid || net.ssid}-${idx}`}
                className={`network-item cursor-pointer p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                  selectedNetwork && selectedNetwork.bssid === net.bssid ? "active" : ""
                }`}
                onClick={() => onSelectNetwork(net)}
              >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{net.ssid || "(hidden)"}</div>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Ch: {net.channel}
                  </div>
                  <div className="text-xs text-gray-500 font-mono bg-green-100 px-2 py-1 rounded truncate max-w-[120px]">
                    {net.bssid}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="network-item py-4 text-center text-gray-500">
            {networkSearch ? "No matching networks" : "No networks found. Please try again."}
          </div>
        )}
      </div>
          </>
        )}
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
