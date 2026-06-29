// components/sam/SAMSidebar.jsx
import { useState, useMemo } from "react";
import { ArrowClockwise, MagnifyingGlass, PencilSimple, Check, X } from "@phosphor-icons/react";
import { formatManila } from "../../utils/datetime";

// Compact relative-time label for the auto-refresh indicator.
const formatUpdatedAgo = (ts) => {
  if (!ts) return null;
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 5) return "Updated just now";
  if (secs < 60) return `Updated ${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `Updated ${mins}m ago`;
};

const SAMSidebar = ({
  selectedNetwork,
  lastScannedNetwork,
  onSelectNetwork,
  availableNetworks,
  onScan,
  networksLoading,
  networksRefreshing = false,
  networksError,
  networksUpdatedAt,
  onRefreshNetworks,
  lastScan,
  locationMeta,
  onChangeMeta,
  scanning = false,
}) => {

  const lastScanLabel = formatManila(lastScan?.scan_end);

  // --- Network search filter ---
  const [networkSearch, setNetworkSearch] = useState("");
  const [showAllNetworks, setShowAllNetworks] = useState(false);
  const [metaEditing, setMetaEditing] = useState(true);
  const DEFAULT_VISIBLE = 5;

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

  const visibleNetworks = showAllNetworks || networkSearch
    ? filteredNetworks
    : filteredNetworks.slice(0, DEFAULT_VISIBLE);
  const hasMore = !networkSearch && filteredNetworks.length > DEFAULT_VISIBLE;

  const hasNetworks = Array.isArray(availableNetworks) && availableNetworks.length > 0;
  // Only blank the card on the very first load / hard error (no data yet).
  // Background refreshes and transient errors keep the last known list shown.
  const showInitialLoading = networksLoading && !hasNetworks;
  const showBlockingError = !!networksError && !hasNetworks && !networksLoading;
  const updatedLabel = formatUpdatedAgo(networksUpdatedAt);

  return (
    <div className="sam-sidebar">
      <div className="sidebar-section">
        <div className="info-row">
          <span className="info-label">Current Network</span>
          <span className="info-value">
            {lastScannedNetwork
              ? lastScannedNetwork.ssid || "(hidden)"
              : "N/A"}
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
            disabled={networksLoading || networksRefreshing}
            title="Refresh network list"
            type="button"
          >
            <ArrowClockwise
              className={`refresh-icon${networksLoading || networksRefreshing ? " spinning" : ""}`}
              size={16}
            />
          </button>
        </div>

          {showInitialLoading && <div className="info-value">Loading...</div>}
          {showBlockingError && <div className="info-value error">{networksError}</div>}
        {!showInitialLoading && !showBlockingError && (
          <>
            <div className="network-search-wrapper">
              <MagnifyingGlass className="search-icon" size={16} />
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
                  <X size={14} />
                </button>
              )}
            </div>
            {(updatedLabel || (networksError && hasNetworks)) && (
              <div className="network-refresh-status">
                {networksError && hasNetworks ? (
                  <span className="refresh-status-error">
                    Couldn’t refresh — showing last results
                  </span>
                ) : (
                  <span className="refresh-status-ok">
                    {networksRefreshing ? "Updating…" : updatedLabel}
                  </span>
                )}
              </div>
            )}
            <div className="network-list">
              {visibleNetworks.length > 0 ? (
                visibleNetworks.map((net, idx) => (
                  <div
                    key={`${net.bssid || net.ssid}-${idx}`}
                    className={`network-item${
                      selectedNetwork && selectedNetwork.bssid === net.bssid ? " active" : ""
                    }`}
                    onClick={() => onSelectNetwork(net)}
                  >
                    <div className="network-item-row">
                      <div className="network-item-info">
                        <div className="network-item-ssid">{net.ssid || "(hidden)"}</div>
                      </div>
                      <div className="network-item-chips">
                        <span className="network-chip">Ch: {net.channel}</span>
                        <span className="network-chip bssid">{net.bssid}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="network-item">
                  {networkSearch ? "No matching networks" : "No networks found. Please try again."}
                </div>
              )}
              {hasMore && (
                <button
                  type="button"
                  className="show-more-btn"
                  onClick={() => setShowAllNetworks((prev) => !prev)}
                >
                  {showAllNetworks
                    ? "Show Less"
                    : `Show More (${filteredNetworks.length - DEFAULT_VISIBLE} more)`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="sidebar-section">
        <div className="section-header">
          <h3 className="sidebar-title">Network Details</h3>
          <button
            className="edit-toggle-btn"
            type="button"
            onClick={() => setMetaEditing((prev) => !prev)}
            title={metaEditing ? "Done editing" : "Edit details"}
          >
            {metaEditing ? <Check size={16} /> : <PencilSimple size={16} />}
          </button>
        </div>
        {metaEditing ? (
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
        ) : (
          <div className="meta-view">
            <div className="meta-view-row">
              <span className="meta-view-label">City</span>
              <span className="meta-view-value">{locationMeta.city || "—"}</span>
            </div>
            <div className="meta-view-row">
              <span className="meta-view-label">Province</span>
              <span className="meta-view-value">{locationMeta.province || "—"}</span>
            </div>
            <div className="meta-view-row">
              <span className="meta-view-label">Notes</span>
              <span className="meta-view-value">{locationMeta.notes || "—"}</span>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-actions">
        <button
          className="action-btn primary"
          onClick={onScan}
          disabled={scanning}
          type="button"
        >
          {scanning ? "Scanning…" : "+ Scan Now"}
        </button>
      </div>
    </div>
  );
};

export default SAMSidebar;
