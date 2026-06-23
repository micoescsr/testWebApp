// pages/SAM.jsx
import { useEffect, useState, useRef, useMemo } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import "./SAM.css";
import ThreatsTable from "../../components/sam/ThreatsTable";
import VulnerabilitiesTable from "../../components/sam/VulnerabilitiesTable";
import SAMSidebar from "../../components/sam/SAMSidebar";
import {
  useThreats,
  useVulnerabilities,
  useNetworks,
} from "../../hooks/useSAM";
import { triggerScan, sendMetadata } from "../../api/rasPiApi";
import api from "../../api/axios";
import FindingDetailModal from "../../components/modals/FindingDetailModal/FindingDetailModal";
import StopDetectionModal from "../../components/modals/StopDetectionModal/StopDetectionModal";
import ScanConfirmModal from "../../components/modals/ScanConfirmModal/ScanConfirmModal";
import { stopDetect } from "../../api/detectApi";
import { useNetworkContext } from "../../context/NetworkContext";
import {
  useThreatDetectionContext,
  timeAgo,
} from "../../context/ThreatDetectionContext";
import { useSessionState } from "../../hooks/useSessionState";
import { getApiErrorMessage } from "../../utils/apiError";
import { useToast } from "../../context/ToastContext";

const SAM = () => {
  const { setNetworkScan } = useNetworkContext();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useSessionState(
    "wf:samTab",
    "vulnerabilities",
  );

  // Persist a small snapshot of the selected network (bssid + ssid + timestamp)
  // so we can restore it and auto-fetch vulnerabilities after refresh.
  const [networkSnapshot, setNetworkSnapshot] = useSessionState(
    "wf:selectedNetwork",
    null,
  );
  const [lastScannedSnapshot, setLastScannedSnapshot] = useSessionState(
    "wf:lastScannedNetwork",
    null,
  );

  // Full in-memory objects (hydrated from snapshot or user selection)
  const [selectedNetwork, setSelectedNetworkRaw] = useState(null);
  const [lastScannedNetwork, setLastScannedNetworkRaw] = useState(null);

  // Track whether we attempted to restore from session (run once)
  const restoredRef = useRef(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [findingType, setFindingType] = useState(null); // 'threat' | 'vulnerability'
  const [rawFinding, setRawFinding] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [locationMeta, setLocationMeta] = useState({
    city: "",
    province: "",
    notes: "",
  });
  const [dismissCounter, setDismissCounter] = useState(0);
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopProcessing, setStopProcessing] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(null);
  const redirectTimerRef = useRef(null);
  const [scanConfirm, setScanConfirm] = useState({
    open: false,
    networkId: null,
    ssid: null,
  });

  const { fetchThreatDetail, threatDetail, threatDetailLoading } =
    useThreats();

  const {
    vulnerabilities,
    fetchVulnDetail,
    vulnDetail,
    vulnDetailLoading,
    reloadVulnerabilities,
    clearVulnerabilities,
  } = useVulnerabilities(null); // don't auto-load on select; load after explicit scan

  const {
    networks,
    loading: networksLoading,
    error: networksError,
    refetchNetworks,
  } = useNetworks();

  // --- GLOBAL DETECTION STATE (single polling loop in context) ---
  const {
    detectionStatus,
    setDetectionStatus,
    detectionResults,
    liveThreats,
    displayThreats,
    failureReason,
    refreshStatus,
    resetDetection,
    lastUpdated,
    backendState,
    activeNetwork,
    setActiveNetwork,
  } = useThreatDetectionContext();

  // ─── Wrap setters to also persist snapshots ───────────────────
  const setSelectedNetwork = (net) => {
    setSelectedNetworkRaw(net);
    if (net) {
      setNetworkSnapshot({
        bssid: net.bssid,
        ssid: net.ssid,
        channel: net.channel,
        persistedAt: Date.now(),
      });
    } else {
      setNetworkSnapshot(null);
    }
  };

  const setLastScannedNetwork = (net) => {
    setLastScannedNetworkRaw(net);
    if (net) {
      setLastScannedSnapshot({
        bssid: net.bssid,
        ssid: net.ssid,
        channel: net.channel,
        persistedAt: Date.now(),
      });
    } else {
      setLastScannedSnapshot(null);
    }
  };

  // ─── Restore selectedNetwork from snapshot after refresh ──────
  // Runs once when networks have loaded. Tries to find the persisted
  // network in the live scan list; degrades gracefully if not found.
  useEffect(() => {
    if (restoredRef.current) return;
    if (networksLoading || !networks) return;
    restoredRef.current = true;

    // Restore selectedNetwork
    if (networkSnapshot?.bssid) {
      const match = networks.find((n) => n.bssid === networkSnapshot.bssid);
      if (match) {
        setSelectedNetworkRaw(match);
      } else {
        // Network not in live scan — keep the snapshot for display, flag it
        setSelectedNetworkRaw({
          ...networkSnapshot,
          _notInRange: true,
        });
      }
    }

    // Restore lastScannedNetwork
    if (lastScannedSnapshot?.bssid) {
      const match = networks.find((n) => n.bssid === lastScannedSnapshot.bssid);
      if (match) {
        setLastScannedNetworkRaw(match);
      } else {
        setLastScannedNetworkRaw({ ...lastScannedSnapshot, _notInRange: true });
      }
    }

    // Auto-fetch vulnerabilities for the persisted bssid
    if (networkSnapshot?.bssid) {
      const normalizedBssid = networkSnapshot.bssid.toUpperCase();
      reloadVulnerabilities(normalizedBssid);
    }

    // Push restored network SSID into global context for sidebar/pill
    const restoredSsid = lastScannedSnapshot?.ssid || networkSnapshot?.ssid;
    if (restoredSsid) setActiveNetwork(restoredSsid);

    // Detection state is now persistent (backed by detection_state table).
    // The useThreatDetection hook bootstraps from /detect/status on mount,
    // so no forced IDLE reset is needed here.
  }, [networksLoading, networks]);

  // Helper: Filter vulnerabilities locally if needed
  const filteredVulns =
    selectedNetwork && Array.isArray(vulnerabilities)
      ? vulnerabilities.filter((v) => v.bssid === selectedNetwork.bssid)
      : [];

  const handleMetaChange = (field, value) => {
    setLocationMeta((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectNetwork = async (net) => {
    setSelectedNetwork(net);

    // Fetch metadata using the authenticated axios instance
    try {
      const { default: api } = await import("../../api/axios");
      const res = await api.get("/webapp/network_metadata", {
        params: { bssid: net.bssid || "" },
      });

      const data = res.data;
      setLocationMeta({
        city: data.city || "",
        province: data.province || "",
        notes: data.notes || "",
      });
    } catch (e) {
      if (e.name === "CanceledError") {
        console.log("Metadata fetch aborted");
      } else {
        console.warn(
          "Metadata fetch failed:",
          e?.response?.status || e.message,
        );
      }
      setLocationMeta({ city: "", province: "", notes: "" });
    }

    // Do not auto-reload vulnerabilities here. Vulnerabilities are loaded
    // only when the user triggers a scan (handleScan) to avoid showing stale data.
  };

  const handleScan = async () => {
    if (!selectedNetwork) {
      showToast("Please select a network first", "error");
      return;
    }

    if (!selectedNetwork?.bssid || selectedNetwork?.channel === undefined) {
      showToast("Select a full network first", "error");
      return;
    }

    const channelNum = Number(selectedNetwork.channel);
    if (!Number.isFinite(channelNum)) {
      showToast("Invalid channel value", "error");
      return;
    }

    if (!locationMeta.city || !locationMeta.province || !locationMeta.notes) {
      showToast("City, Province, and Notes are required", "error");
      return;
    }

    // 1. STOP previous detection & set scanning state
    resetDetection();
    setDetectionStatus("SCANNING");

    try {
      // 2. Trigger Scan
      const result = await triggerScan(selectedNetwork);
      setLastScan(result);
      setLastScannedNetwork(selectedNetwork);

      // Push active network SSID into global context for sidebar/pill
      setActiveNetwork(selectedNetwork.ssid || null);

      // 3. Save Results (use API wrapper so base URL/auth are centralized)
      const saveRes = await sendMetadata({
        ssid: selectedNetwork.ssid,
        bssid: selectedNetwork.bssid,
        channel: channelNum,
        city: locationMeta.city,
        province: locationMeta.province,
        notes: locationMeta.notes,
        scan: result,
        encryption_status: selectedNetwork.encryption_status,
        num_clients: selectedNetwork.num_clients,
      });

      if (!saveRes || saveRes.status >= 400) throw new Error("Save failed");

      // 👈 NEW: Get network_id from response + navigate!
      const saveData = saveRes.data;
      const networkId = saveData.network_id; // From Supabase upsert
      const scanId = saveData.scan_id; // From Supabase insert

      // Store both in React context (in-memory, not localStorage)
      setNetworkScan(networkId, scanId);

      setScanConfirm({
        open: true,
        networkId,
        ssid: selectedNetwork.ssid || "",
      });

      // 4. Detection auto-started by backend (detectStateService.startOrSwitch)
      //    Refresh UI state from the backend's detection_state row.
      await refreshStatus();
      const normalizedBssid = (selectedNetwork.bssid || "").toUpperCase();
      await reloadVulnerabilities(normalizedBssid);

      // 5. Show vulnerabilities first, then auto-switch to Threats after countdown
      setActiveTab("vulnerabilities");
      setRedirectCountdown(5);
      if (redirectTimerRef.current) clearInterval(redirectTimerRef.current);
      redirectTimerRef.current = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(redirectTimerRef.current);
            redirectTimerRef.current = null;
            setActiveTab("threats");
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Scan error:", err);
      showToast("Scan failed", "error");
      setDetectionStatus("IDLE");
    }
  };

  const saveSelectedNetwork = async () => {
    if (!selectedNetwork?.bssid || selectedNetwork?.channel === undefined) {
      showToast("Select a full network first", "error");
      return;
    }

    try {
      //const res = await fetch("/api/networks", {
      const res = await api.post("/rasPi/networks", {
        ssid: selectedNetwork.ssid,
        bssid: selectedNetwork.bssid,
        channel: selectedNetwork.channel,
      });

      showToast("Network saved to DB!", "success");
    } catch (err) {
      console.error(err);
      showToast(`Save failed: ${getApiErrorMessage(err, "Please try again.")}`, "error");
    }
  };

  const openThreatDetail = async (threat) => {
    const key =
      typeof threat?.id === "string" && threat.id.includes("-")
        ? threat.id
        : threat?.name;

    setFindingType("threat");
    setRawFinding(threat);
    await fetchThreatDetail(key);
    setIsModalOpen(true);
  };

  const openVulnDetail = (vuln) => {
    setFindingType("vulnerability");
    setRawFinding(vuln);
    setIsModalOpen(true);
    fetchVulnDetail(vuln);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFindingType(null);
    setRawFinding(null);
  };

  // ——— Stop Detection handler ———
  const handleStopDetection = async (reasonCode, reasonNote) => {
    setStopProcessing(true);
    try {
      await stopDetect(reasonCode, reasonNote);
      resetDetection();
      await refreshStatus();
      setShowStopModal(false);
    } catch (err) {
      console.error("[stop detection]", err);
      showToast(getApiErrorMessage(err, "Failed to stop detection"), "error");
    } finally {
      setStopProcessing(false);
    }
  };

  const currentDetail = findingType === "threat" ? threatDetail : vulnDetail;
  const detailLoading =
    findingType === "threat" ? threatDetailLoading : vulnDetailLoading;

  const tabs = [
    { label: "Threats", value: "threats" },
    { label: "Vulnerabilities", value: "vulnerabilities" },
  ];

  // ─── Compact detection status pill ──────────────────────────
  const isOutOfRange = selectedNetwork?._notInRange === true;

  const showOutOfRangeBanner = useMemo(() => {
    if (!selectedNetwork?._notInRange) return false;
    const id = selectedNetwork?.bssid || selectedNetwork?.ssid;
    if (!id) return false;
    return sessionStorage.getItem(`wf:dismissOutOfRange:${id}`) !== "true";
  }, [selectedNetwork, dismissCounter]);

  const handleDismissOutOfRange = () => {
    const id = selectedNetwork?.bssid || selectedNetwork?.ssid;
    if (id) sessionStorage.setItem(`wf:dismissOutOfRange:${id}`, "true");
    setDismissCounter((c) => c + 1);
  };

  let statusPillConfig = null;
  if (detectionStatus === "DETECTING") {
    // Detection is actively running — always show Monitoring, even if network is out of range
    const ssid =
      backendState?.ssid ||
      activeNetwork ||
      (lastScannedNetwork || selectedNetwork)?.ssid ||
      "";
    statusPillConfig = {
      label: `Monitoring${ssid ? `: ${ssid}` : ""}`,
      cls: "monitoring",
    };
  } else if (detectionStatus === "SCANNING") {
    statusPillConfig = { label: "Starting\u2026", cls: "starting" };
  } else if (detectionStatus === "FAILED") {
    statusPillConfig = { label: "Failed", cls: "failed" };
  } else if (isOutOfRange) {
    // Only show "Paused" when detection is NOT actively running
    statusPillConfig = { label: "Paused \u2014 out of range", cls: "paused" };
  }

  return (
    <div
      className={activeTab === "vulnerabilities" ? "sam-layout" : "sam-page"}
    >
      <div className="sam-main">
        <h1 className="page-title">Security Assessment Management</h1>

        {detectionStatus === "FAILED" && (
          <div className="status-banner failed">
            Detection failed: {failureReason || "Unknown error"}. Run a new scan
            to restart.
          </div>
        )}

        {redirectCountdown !== null && (
          <div className="status-banner redirect-banner">
            <span>
              Switching to <strong>Threats</strong> tab in{" "}
              <strong>{redirectCountdown}s</strong>\u2026
            </span>
            <button
              className="dismiss-banner-btn"
              onClick={() => {
                if (redirectTimerRef.current) {
                  clearInterval(redirectTimerRef.current);
                  redirectTimerRef.current = null;
                }
                setRedirectCountdown(null);
              }}
              title="Stay on Vulnerabilities"
            >
              Cancel
            </button>
          </div>
        )}

        {selectedNetwork?._notInRange && showOutOfRangeBanner && (
          <div className="status-banner warning out-of-range-banner">
            <span>
              Previously selected network &ldquo;{selectedNetwork.ssid}&rdquo;
              is no longer in range. Select a new network to scan.
            </span>
            <button
              className="dismiss-banner-btn"
              onClick={handleDismissOutOfRange}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <div className="sam-header">
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          {statusPillConfig && (
            <div className={`detection-status-pill ${statusPillConfig.cls}`}>
              <span className="pill-dot" />
              <span className="pill-label">{statusPillConfig.label}</span>
              {lastUpdated && !isOutOfRange && detectionStatus !== "IDLE" && (
                <span className="pill-time">{timeAgo(lastUpdated)}</span>
              )}
              {detectionStatus === "DETECTING" && (
                <button
                  className="stop-detection-btn"
                  onClick={() => setShowStopModal(true)}
                  title="Stop threat detection"
                >
                  Stop
                </button>
              )}
            </div>
          )}
        </div>

        {activeTab === "threats" && (
          <ThreatsTable
            threats={displayThreats}
            onView={openThreatDetail}
            detectionStatus={detectionStatus}
          />
        )}

        {activeTab === "vulnerabilities" && (
          <VulnerabilitiesTable
            vulnerabilities={vulnerabilities}
            onView={openVulnDetail}
            onClear={() => {
              const bssid = selectedNetwork?.bssid || lastScannedNetwork?.bssid;
              clearVulnerabilities(bssid);
            }}
          />
        )}
      </div>

      {activeTab === "vulnerabilities" && (
        <SAMSidebar
          selectedNetwork={selectedNetwork}
          lastScannedNetwork={lastScannedNetwork}
          onSelectNetwork={handleSelectNetwork}
          availableNetworks={networks}
          networksLoading={networksLoading}
          networksError={networksError}
          onRefreshNetworks={refetchNetworks}
          onScan={handleScan}
          onSaveNetwork={saveSelectedNetwork}
          lastScan={lastScan}
          locationMeta={locationMeta}
          onChangeMeta={handleMetaChange}
        />
      )}

      {isModalOpen && (
        <FindingDetailModal
          onClose={closeModal}
          finding={currentDetail}
          rawFinding={rawFinding}
          findingType={findingType}
          loading={detailLoading || !currentDetail}
        />
      )}

      <StopDetectionModal
        isOpen={showStopModal}
        onClose={() => setShowStopModal(false)}
        onConfirm={handleStopDetection}
        isProcessing={stopProcessing}
      />

      <ScanConfirmModal
        isOpen={scanConfirm.open}
        onClose={() =>
          setScanConfirm({ open: false, networkId: null, ssid: null })
        }
        networkId={scanConfirm.networkId}
        ssid={scanConfirm.ssid}
      />
    </div>
  );
};

export default SAM;
