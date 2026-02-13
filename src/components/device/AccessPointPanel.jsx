// components/device/AccessPointPanel.jsx - FIXED with network config display + conditional password
const AccessPointPanel = ({
  accessPoint,
  networkConfig,      // 👈 NEW: from DeviceManagement (scan data)
  apPassword,         // 👈 NEW: password state
  setApPassword,      // 👈 NEW: password setter
  loading,
  error,
  isEmpty,
  onRetry,
  onToggle,
}) => {
  const isEncrypted = networkConfig?.encryption_type !== 'Open';

  return (
    <div className="right-panel">
      {/* 👈 Toggle stays the same */}
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

        {/* 👈 NEW: Always show scan config (even when disabled) */}
        <div className="config-section">
          <div className="info-row">
            <span>SSID</span>
            <span>{networkConfig?.ssid || "N/A"}</span>
          </div>
          <div className="info-row">
            <span>BSSID</span>
            <span>{networkConfig?.bssid || "N/A"}</span>
          </div>
          <div className="info-row">
            <span>Channel</span>
            <span>{networkConfig?.channel || "N/A"}</span>
          </div>
          <div className="info-row">
            <span>Encryption</span>
            <span>{networkConfig?.encryption_type || "N/A"}</span>
          </div>
          
          {/* 👈 NEW: Conditional AP Password input (only for encrypted) */}
          {isEncrypted && (
            <div className="info-row">
              <span>AP Password</span>
              <input
                type="password"
                value={apPassword}
                onChange={(e) => setApPassword(e.target.value)}
                placeholder="Enter password for WPA2"
                className="ap-password-input"
              />
            </div>
          )}
          {!isEncrypted && (
            <div className="info-row">
              <span>AP Password</span>
              <span>✅ Open network - no password</span>
            </div>
          )}
        </div>

        {/* 👈 Existing loading/error states */}
        {loading && (
          <div className="state-message loading-state">
            <p>Loading AP status...</p>
          </div>
        )}

        {error && !isEmpty && (
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
              Enable to activate with above configuration +{isEncrypted ? ' password' : ''}
            </small>
          </div>
        )}

        {/* AP enabled but no config (404) */}
        {!loading && !error && isEmpty && (
          <div className="state-message empty-state">
            <p>No access point status available.</p>
            <small>Device may be configuring...</small>
          </div>
        )}

        {/* AP enabled + runtime data */}
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
};

export default AccessPointPanel;
