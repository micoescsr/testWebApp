// components/dashboard/DashboardHeader.jsx
const DashboardHeader = ({
  viewMode,
  setViewMode,
  isSummary,
  networks,
  scanList,
  selectedScanId,
  onScanChange,
  piStatus,
}) => {
  const formatDate = (iso) => {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  const isOnline = piStatus?.online === true;
  const isLoading = piStatus?.online === null;
  const deviceModel = piStatus?.data?.model || "Raspberry Pi";

  return (
    <div className={isSummary ? "dash-header-summary" : "dash-header"}>
      <h1>Dashboard</h1>

      <div className="dash-filters">
        <div className="filter-group">
          <label>NETWORK</label>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="Summary">Summary</option>
            {(networks || []).map((n) => (
              <option key={n.network_id} value={n.network_id}>
                {n.ssid || "Unnamed Network"}
              </option>
            ))}
          </select>
        </div>

        {!isSummary && (
          <div className="filter-group">
            <label>DATE</label>
            <select
              value={selectedScanId || ""}
              onChange={(e) => onScanChange(e.target.value || null)}
              disabled={!scanList || scanList.length === 0}
            >
              <option value="">Latest</option>
              {(scanList || []).map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {formatDate(s.finished_at)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="device-status">
        <p className="status-label">Device Status:</p>
        <p className="status-line">
          Model: <span>{deviceModel}</span>
        </p>
        <p className="status-line">
          Status:{" "}
          {isLoading ? (
            <span className="status-checking">Checking…</span>
          ) : isOnline ? (
            <span className="status-online">Online</span>
          ) : (
            <span className="status-offline">Offline</span>
          )}
        </p>
      </div>
    </div>
  );
};

export default DashboardHeader;
