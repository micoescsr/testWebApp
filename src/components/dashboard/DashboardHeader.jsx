// components/dashboard/DashboardHeader.jsx
const DashboardHeader = ({
  viewMode,
  setViewMode,
  isSummary,
  networks,
  scanOptions = [],
  selectedScanId,
  setSelectedScanId,
}) => (
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
          {networks.map((n) => (
            <option key={n.network_id} value={n.network_id}>
              {n.ssid}
            </option>
          ))}
        </select>
      </div>

      {!isSummary && (
        <div className="filter-group">
          <label>DATE</label>
          <select
            value={selectedScanId ?? ""}
            onChange={(e) => setSelectedScanId(Number(e.target.value))}
          >
            {scanOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>

    <div className="device-status">
      <p className="status-label">Device Status:</p>
      <p className="status-line">
        Model: <span>Raspberry Pi 5</span>
      </p>
      <p className="status-line">
        Status: <span className="status-online">Online ●</span>
      </p>
    </div>
  </div>
);

export default DashboardHeader;
