// components/device/AccessPointPanel.jsx - deterministic banners from admin state
import { useNavigate } from "react-router-dom";

const AccessPointPanel = ({
  accessPoint,
  networkConfig,
  apPassword,
  setApPassword,
  loading,
  error,
  scanError,
  hasScanId,
  adminState,          // full admin state from /network/:id/state
  onRetry,
  onToggle,
  onUpdatePortal,      // "Update Portal" button handler
}) => {
  const navigate = useNavigate();
  const isEncrypted = networkConfig?.encryption_type !== "Open";

  // Derived flags from admin state (all deterministic, no guessing)
  const apApplyInProgress = adminState?.ap_apply_in_progress ?? false;
  const scanState = adminState?.scan_state ?? {};
  const portalState = adminState?.portal_state ?? {};
  const riskState = adminState?.risk_state ?? {};
  const flags = adminState?.flags ?? {};

  const hasScan = scanState.has_scan ?? false;
  const scanFresh = scanState.scan_fresh ?? false;
  const portalOutOfDate = portalState.portal_out_of_date ?? false;
  const networkConfigMissing = flags.network_config_missing ?? false;

  // Toggle is disabled while loading, during in-progress apply, or when enabling without a scan
  const toggleDisabled = loading || apApplyInProgress || (!accessPoint?.enabled && !hasScanId);

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

        {/* ── Deterministic banners from admin state ─────────── */}

        {/* Banner: AP apply in progress (locks controls) */}
        {apApplyInProgress && (
          <div className="state-message info-state">
            <p>Applying AP configuration...</p>
            <small>Please wait while the change is being applied.</small>
          </div>
        )}

        {/* Banner: Scan required to enable (AP off + no scan at all) */}
        {!accessPoint?.enabled && !hasScan && !apApplyInProgress && (
          <div className="state-message warning-state">
            <p>Scan required to enable Access Point.</p>
            <small>Run a scan to get the latest network configuration.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Go to Scan
            </button>
          </div>
        )}

        {/* Banner: Scan stale + AP off (blocking — must scan before enable) */}
        {!accessPoint?.enabled && hasScan && !scanFresh && !apApplyInProgress && (
          <div className="state-message warning-state">
            <p>Scan is stale.</p>
            <small>Run a new scan before enabling the access point.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Scan Again
            </button>
          </div>
        )}

        {/* Banner: Portal out of date (AP on, risk version mismatch) */}
        {accessPoint?.enabled && portalOutOfDate && !apApplyInProgress && (
          <div className="state-message warning-state">
            <p>Captive portal content is out of date.</p>
            <small>Risk level changed since last portal update.</small>
            {onUpdatePortal && (
              <button onClick={onUpdatePortal} disabled={loading} style={{ marginTop: 8 }}>
                {loading ? "Updating..." : "Update Portal"}
              </button>
            )}
          </div>
        )}

        {/* Banner: Scan stale while AP is on (info, non-blocking) */}
        {accessPoint?.enabled && hasScan && !scanFresh && !apApplyInProgress && (
          <div className="state-message info-state">
            <p>Scan data is getting old.</p>
            <small>Consider running a new scan to keep risk assessment current.</small>
          </div>
        )}

        {/* Banner: Network config missing */}
        {networkConfigMissing && !apApplyInProgress && (
          <div className="state-message warning-state">
            <p>Network configuration incomplete.</p>
            <small>SSID, BSSID, or channel is missing. Re-scan the network.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Go to Scan
            </button>
          </div>
        )}

        {/* Scan validation errors from backend (on toggle attempt) */}
        {scanError && scanError !== "SCAN_REQUIRED" && (
          <div className="state-message warning-state">
            <p>
              {scanError === "SCAN_TOO_OLD" && "Scan is outdated."}
              {scanError === "SCAN_NETWORK_MISMATCH" && "Scan does not match this network."}
              {scanError === "SCAN_NOT_FOUND" && "Scan not found."}
              {scanError === "SCAN_NOT_FINISHED" && "Scan has not finished yet."}
              {scanError === "SCAN_FAILED" && "Scan failed or was cancelled."}
              {scanError === "SCAN_HAS_ERRORS" && "Scan completed with errors."}
              {scanError === "SCAN_INVALID_DATA" && "Scan contains no data."}
            </p>
            <small>Run a new scan before enabling the access point.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Scan Again
            </button>
          </div>
        )}
      </div>

      <div className="side-card">
        <h3>Access Point Info</h3>

        {/* Risk badge */}
        {adminState && (
          <div className="info-row">
            <span>Risk Level</span>
            <span className={`risk-badge risk-${(riskState.risk_bucket || "LOW").toLowerCase()}`}>
              {riskState.risk_bucket || "LOW"}
            </span>
          </div>
        )}

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

        {loading && !apApplyInProgress && (
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

        {!loading && !error && !scanError && accessPoint?.enabled === false && !apApplyInProgress && (
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
