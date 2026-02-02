// components/device/AccessPointPanel.jsx
const AccessPointPanel = ({ accessPoint, loading, error, onToggle }) => (
  <div className="right-panel">
    <div className="side-card">
      <h3>Device Access Point</h3>
      <div className="toggle-row">
        <span>Enabled / Disabled</span>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={accessPoint?.enabled ?? false}
            disabled={loading || !accessPoint}
            onChange={onToggle}
          />
          <span className="slider"></span>
        </label>
      </div>
    </div>

    <div className="side-card">
      <h3>Access Point Info</h3>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && accessPoint && (
        <>
          <div className="info-row">
            <span>Current Network</span>
            <span>{accessPoint.currentNetwork}</span>
          </div>
          <div className="info-row">
            <span>Access Point Network</span>
            <span>{accessPoint.accessPointNetwork}</span>
          </div>
          <div className="info-row">
            <span>Access Point Status</span>
            <span>{accessPoint.status}</span>
          </div>
          <div className="info-row">
            <span>Connected Clients</span>
            <span>{accessPoint.connectedClients}</span>
          </div>
        </>
      )}
    </div>
  </div>
);

export default AccessPointPanel;
