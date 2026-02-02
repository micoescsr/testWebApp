// components/dashboard/DashboardHeader.jsx
const DashboardHeader = ({ viewMode, setViewMode, isSummary }) => (
  <div className={isSummary ? "dash-header-summary" : "dash-header"}>
    <h1>Dashboard</h1>

    <div className="dash-filters">
      <div className="filter-group">
        <label>NETWORK</label>
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
        >
          <option>Summary</option>
          <option>Nacho_WiFi</option>
        </select>
      </div>

      {!isSummary && (
        <div className="filter-group">
          <label>DATE</label>
          <select>
            <option>Nov 14, 2025</option>
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
