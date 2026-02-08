// components/device/AccessPointPanel.jsx
const AccessPointPanel = ({ 
  accessPoint, 
  loading, 
  error, 
  isEmpty, 
  onRetry, 
  onToggle 
}) => (
  <div className="right-panel">
    {/* Toggle always visible - disable during loading */}
    <div className="side-card">
      <h3>Device Access Point</h3>
      <div className="toggle-row">
        <span>Enabled / Disabled</span>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={accessPoint?.enabled ?? false}
            disabled={loading}
            onChange={onToggle}
          />
          <span className="slider"></span>
        </label>
      </div>
    </div>

    {/* Info shows conditional states */}
    <div className="side-card">
      <h3>Access Point Info</h3>

      {loading && (
        <div className="state-message loading-state">
          <p>Loading...</p>
        </div>
      )}

      {error && (
        <div className="state-message error-state">
          <p>{error}</p>
          <button onClick={onRetry} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {isEmpty && (
        <div className="state-message empty-state">
          <p>No access point configured</p>
          <small>Toggle above to enable</small>
        </div>
      )}

      {!loading && !error && !isEmpty && accessPoint && (
        <>
          <div className="info-row">
            <span>Current Network</span>
            <span>{accessPoint.currentNetwork ?? "N/A"}</span>
          </div>
          <div className="info-row">
            <span>Access Point Network</span>
            <span>{accessPoint.accessPointNetwork ?? "N/A"}</span>
          </div>
          <div className="info-row">
            <span>Access Point Status</span>
            <span>{accessPoint.status ?? "N/A"}</span>
          </div>
          <div className="info-row">
            <span>Connected Clients</span>
            <span>{accessPoint.connectedClients ?? "N/A"}</span>
          </div>
        </>
      )}
    </div>
  </div>
);

export default AccessPointPanel;
