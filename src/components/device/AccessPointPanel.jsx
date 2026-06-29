// components/device/AccessPointPanel.jsx - deterministic banners from admin state
import { useNavigate } from "react-router-dom";
import Spinner from "../common/Spinner/Spinner";

/**
 * Compute the single highest-priority banner to show.
 * Returns { type, cssClass } or null if no banner applies.
 *
 * Priority (top wins, stop at first match):
 *  1. network_config_missing       → blocking
 *  2. async job active (ACCEPTED/ONGOING) → info "applying…" with spinner
 *  3. async job DONE, live confirming     → info "verifying…"
 *  4. async job FAILED                    → error
 *  5. ap_apply_in_progress (no reconciliation) → blocking + disable controls
 *  6. toggle_reconciling_timeout   → info "checking device state…"
 *  7. scanError (backend validation on toggle attempt)
 *  8. AP off + no scan             → blocking "Scan required"
 *  9. AP off + stale scan          → blocking "Scan is stale"
 * 10. AP on + portal outdated      → warning + Update Portal button
 * 11. AP on + stale scan           → info (non-blocking)
 */
function computeBanner({ networkConfigMissing, apApplyInProgress, isReconcilingToggle, scanError, apEnabled, hasScan, scanFresh, portalOutOfDate, hasError, isJobActive, jobStatus, apLiveConfirmed, jobError }) {
  if (networkConfigMissing)                                                     return "config_missing";
  if (isJobActive)                                                              return "job_active";
  if (jobStatus === 'DONE' && !apLiveConfirmed)                                 return "job_confirming";
  if (jobStatus === 'FAILED' || jobError)                                       return "job_failed";
  if (apApplyInProgress && !isReconcilingToggle && !hasError)                   return "apply_in_progress";
  if (isReconcilingToggle)                                                      return "toggle_reconciling_timeout";
  if (scanError && scanError !== "SCAN_REQUIRED")                               return "scan_error";
  if (!apEnabled && !hasScan)                                                   return "scan_required";
  if (!apEnabled && hasScan && !scanFresh)                                      return "scan_stale_blocking";
  if (apEnabled && portalOutOfDate)                                             return "portal_outdated";
  if (apEnabled && hasScan && !scanFresh)                                       return "scan_stale_info";
  return null;
}

const AccessPointPanel = ({
  accessPoint,
  networkConfig,
  apPassword,
  setApPassword,
  loading,
  error,
  scanError,
  hasScanId,
  adminState,
  isReconcilingToggle,
  // Async AP job props
  isJobActive,
  jobStatus,
  jobError,
  apLiveConfirmed,
  targetApStatus,
  onRetry,
  onToggle,
  onUpdatePortal,
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

  // Single exclusive banner — only ONE renders at a time
  const banner = computeBanner({
    networkConfigMissing,
    apApplyInProgress,
    isReconcilingToggle: isReconcilingToggle ?? false,
    scanError,
    apEnabled: accessPoint?.enabled ?? false,
    hasScan,
    scanFresh,
    portalOutOfDate,
    hasError: !!error,
    isJobActive: isJobActive ?? false,
    jobStatus: jobStatus ?? null,
    apLiveConfirmed: apLiveConfirmed ?? false,
    jobError: jobError ?? null,
  });

  // Toggle is disabled while loading, during in-progress apply, active async job, or when enabling without a scan
  const toggleDisabled = loading || apApplyInProgress || isReconcilingToggle || isJobActive
    || (jobStatus === 'DONE' && !apLiveConfirmed)
    || (!accessPoint?.enabled && !hasScanId);

  const handleToggleClick = () => {
    if (!accessPoint?.enabled && isEncrypted && !apPassword) {
      return alert("Enter AP password for encrypted network");
    }
    onToggle(apPassword);
  };

  // Map scanError code to user-friendly text
  const scanErrorText = {
    SCAN_TOO_OLD: "Scan is outdated.",
    SCAN_NETWORK_MISMATCH: "Scan does not match this network.",
    SCAN_NOT_FOUND: "Scan not found.",
    SCAN_NOT_FINISHED: "Scan has not finished yet.",
    SCAN_FAILED: "Scan failed or was cancelled.",
    SCAN_HAS_ERRORS: "Scan completed with errors.",
    SCAN_INVALID_DATA: "Scan contains no data.",
    ENCRYPTION_MISMATCH: "Network security type has changed.",
    NETWORK_DATA_OUTDATED: "Network details are outdated.",
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

        {/* ── Single exclusive banner (strict priority) ─────── */}

        {banner === "config_missing" && (
          <div className="state-message warning-state">
            <p>Network configuration incomplete.</p>
            <small>SSID, BSSID, or channel is missing. Re-scan the network.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Go to Scan
            </button>
          </div>
        )}

        {banner === "apply_in_progress" && (
          <div className="state-message info-state">
            <p>Applying AP configuration…</p>
            <small>Please wait while the change is being applied.</small>
          </div>
        )}

        {banner === "job_active" && (
          <div className="state-message info-state">
            <Spinner label={`${targetApStatus === 'enable' ? 'Enabling' : 'Disabling'} access point…`} />
            <small>This may take up to a minute. Do not close this tab.</small>
          </div>
        )}

        {banner === "job_confirming" && (
          <div className="state-message info-state">
            <Spinner label="Verifying device state…" />
            <small>Confirming the access point {targetApStatus === 'enable' ? 'is active' : 'has stopped'}.</small>
          </div>
        )}

        {banner === "job_failed" && (
          <div className="state-message error-state">
            <p>{jobError?.message || 'AP operation failed.'}</p>
            <small>You can retry the operation.</small>
            <button onClick={onRetry} disabled={loading} style={{ marginTop: 8 }}>
              Retry
            </button>
          </div>
        )}

        {banner === "toggle_reconciling_timeout" && (
          <div className="state-message info-state">
            <p>The device is taking longer than expected.</p>
            <small>Checking actual access point state…</small>
          </div>
        )}

        {banner === "scan_error" && (
          <div className="state-message warning-state">
            <p>{scanErrorText[scanError] || "Scan validation failed."}</p>
            <small>Run a new scan before enabling the access point.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Scan Again
            </button>
          </div>
        )}

        {banner === "scan_required" && (
          <div className="state-message warning-state">
            <p>Scan required to enable Access Point.</p>
            <small>Run a scan to get the latest network configuration.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Go to Scan
            </button>
          </div>
        )}

        {banner === "scan_stale_blocking" && (
          <div className="state-message warning-state">
            <p>Scan is stale.</p>
            <small>Run a new scan before enabling the access point.</small>
            <button onClick={() => navigate("/security-assessment")} style={{ marginTop: 8 }}>
              Scan Again
            </button>
          </div>
        )}

        {banner === "portal_outdated" && (
          <div className="state-message warning-state">
            <p>Captive portal content is out of date.</p>
            <small>Risk level changed since last portal update.</small>
            {onUpdatePortal && (
              <button onClick={onUpdatePortal} disabled={loading} style={{ marginTop: 8 }}>
                {loading ? "Updating…" : "Update Portal"}
              </button>
            )}
          </div>
        )}

        {banner === "scan_stale_info" && (
          <div className="state-message info-state">
            <p>Scan data is getting old.</p>
            <small>Consider running a new scan to keep risk assessment current.</small>
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
            <div className="info-row ap-password-row">
              <span>AP Password</span>
              <input
                type="password"
                value={apPassword}
                onChange={(e) => setApPassword(e.target.value)}
                placeholder="Enter password for WPA2"
                className="ap-password-input"
                disabled={isJobActive || (jobStatus === 'DONE' && !apLiveConfirmed)}
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
