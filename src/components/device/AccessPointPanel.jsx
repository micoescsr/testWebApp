// components/device/AccessPointPanel.jsx
const AccessPointPanel = ({
  accessPoint,
  loading,
  error,
  isEmpty,
  onRetry,
  onToggle,
}) => (
  <div className="right-panel">
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

      {/* AP disabled */}
      {!loading && !error && !isEmpty && accessPoint.enabled === false && (
        <div className="state-message empty-state">
          <p>Access point is currently disabled.</p>
          <small>
            Please enable the device access point to view AP information.
          </small>
        </div>
      )}

      {/* AP enabled but no config (404) */}
      {!loading && !error && isEmpty && (
        <div className="state-message empty-state">
          <p>No access point is configured.</p>
          <small>Configure an access point on the device or try again.</small>
        </div>
      )}

      {/* AP enabled + data */}
      {!loading &&
        !error &&
        !isEmpty &&
        accessPoint.enabled === true && (
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
