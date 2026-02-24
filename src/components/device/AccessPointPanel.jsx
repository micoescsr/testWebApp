// components/device/AccessPointPanel.jsx - AP config + scan validation + toggle
import { useNavigate } from "react-router-dom";

const AccessPointPanel = ({
  accessPoint,
  networkConfig,
  apPassword,
  setApPassword,
  loading,
  error,
  scanError,        // "SCAN_REQUIRED" | "SCAN_TOO_OLD" | "SCAN_NETWORK_MISMATCH" | null
  hasScanId,        // whether a scan_id is available in context
  onRetry,
  onToggle,         // called with (apPassword)
}) => {
  const navigate = useNavigate();
  const isEncrypted = networkConfig?.encryption_type !== "Open";

  // Toggle is disabled while loading, or when enabling without a scan
  const toggleDisabled = loading || (!accessPoint?.enabled && !hasScanId);

  const handleToggleClick = () => {
    if (!accessPoint?.enabled && isEncrypted && !apPassword) {
      return alert("Enter AP password for encrypted network");
    }
    onToggle(apPassword);
  };

  return (
    <div className="right-panel">
      <div className="side-card">
        <h3>Device Access Point</h3>
        <div className="toggle-row">
          <span>Enabled / Disabled</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={accessPoint?.enabled ?? false}
              disabled={toggleDisabled}
              onChange={handleToggleClick}
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* Scan required banner */}
        {!hasScanId && !accessPoint?.enabled && (
          <div className="state-message warning-state">
            <p>Scan required to enable Access Point.</p>
            <small>Run a scan to get the latest network configuration.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Go to Scan
            </button>
          </div>
        )}

        {/* Scan validation errors from backend */}
        {scanError === "SCAN_TOO_OLD" && (
          <div className="state-message warning-state">
            <p>Scan is outdated.</p>
            <small>Run a new scan before enabling the access point.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Scan Again
            </button>
          </div>
        )}
        {scanError === "SCAN_NETWORK_MISMATCH" && (
          <div className="state-message warning-state">
            <p>Scan does not match this network.</p>
            <small>The selected scan belongs to a different network. Run a new scan.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Scan Again
            </button>
          </div>
        )}
      </div>

      <div className="side-card">
        <h3>Access Point Info</h3>

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
              <span>Open network — no password needed</span>
            </div>
          )}
        </div>

        {loading && (
          <div className="state-message loading-state">
            <p>Updating AP status...</p>
          </div>
        )}

        {error && !scanError && (
          <div className="state-message error-state">
            <p>{error}</p>
            <button onClick={onRetry} disabled={loading}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && !scanError && accessPoint?.enabled === false && (
          <div className="state-message empty-state">
            <p>Access point is currently disabled.</p>
            <small>
              Enable to activate with above configuration{isEncrypted ? " + password" : ""}
            </small>
          </div>
        )}

        {!loading && !error && accessPoint?.enabled === true && (
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
