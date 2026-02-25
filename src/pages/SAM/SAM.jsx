// pages/SAM.jsx
import { useEffect, useState, useRef } from "react";
import Tabs from "../../components/common/Tabs/Tabs";
import "./SAM.css";
import ThreatsTable from "../../components/sam/ThreatsTable";
import VulnerabilitiesTable from "../../components/sam/VulnerabilitiesTable";
import SAMSidebar from "../../components/sam/SAMSidebar";
import {
  useThreats,
  useVulnerabilities,
  useNetworks,
  useThreatDetection,
} from "../../hooks/useSAM";
import { triggerScan, sendMetadata } from "../../api/rasPiApi";
import FindingDetailModal from "../../components/modals/FindingDetailModal/FindingDetailModal";
import { useNetworkContext } from "../../context/NetworkContext";
import { useSessionState } from "../../hooks/useSessionState";

const SAM = () => {
  const { setNetworkScan } = useNetworkContext();
  const [activeTab, setActiveTab] = useSessionState("wf:samTab", "vulnerabilities");

  // Persist a small snapshot of the selected network (bssid + ssid + timestamp)
  // so we can restore it and auto-fetch vulnerabilities after refresh.
  const [networkSnapshot, setNetworkSnapshot] = useSessionState("wf:selectedNetwork", null);
  const [lastScannedSnapshot, setLastScannedSnapshot] = useSessionState("wf:lastScannedNetwork", null);

  // Full in-memory objects (hydrated from snapshot or user selection)
  const [selectedNetwork, setSelectedNetworkRaw] = useState(null);
  const [lastScannedNetwork, setLastScannedNetworkRaw] = useState(null);

  // Track whether we attempted to restore from session (run once)
  const restoredRef = useRef(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [detectionPausedByRefresh, setDetectionPausedByRefresh] = useState(false);
  const [locationMeta, setLocationMeta] = useState({
    city: "",
    province: "",
    notes: "",
  });

  const {
    threats,
    fetchThreatDetail,
    threatDetail,
    threatDetailLoading,
  } = useThreats();

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
  } = useNetworks();

  // --- POLLING HOOK ---
  const {
    detectionStatus,
    setDetectionStatus,
    detectionResults,
    liveThreats,
    displayThreats,
    resetDetection,
  } = useThreatDetection();

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

    // Force DETECTING → IDLE on refresh (no resume yet)
    if (detectionStatus === "DETECTING" || detectionStatus === "SCANNING") {
      resetDetection();
      setDetectionPausedByRefresh(true);
    }
  }, [networksLoading, networks]);

  useEffect(() => {
    console.log("vulnerabilities state updated:", vulnerabilities);
  }, [vulnerabilities]);

    console.log("liveThreats:", liveThreats);
    console.log("displayThreats:", displayThreats);
  // If there are live threats from polling, show those; otherwise fallback to DB threats
  /* const displayThreats =
    liveThreats && liveThreats.length > 0 ? liveThreats : threats; */

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
        console.warn("Metadata fetch failed:", e?.response?.status || e.message);
      }
      setLocationMeta({ city: "", province: "", notes: "" });
    }

    // Do not auto-reload vulnerabilities here. Vulnerabilities are loaded
    // only when the user triggers a scan (handleScan) to avoid showing stale data.
  };

  const handleScan = async () => {
    if (!selectedNetwork) {
      alert("Please select a network first");
      return;
    }

    // Basic validation
    if (!selectedNetwork?.bssid || selectedNetwork?.channel === undefined) {
      alert("Select a full network first");
      return;
    }

    const channelNum = Number(selectedNetwork.channel);
    if (!Number.isFinite(channelNum)) {
      alert("Invalid channel value");
      return;
    }

    if (!locationMeta.city || !locationMeta.province || !locationMeta.notes) {
      alert("City, Province, and Notes are required");
      return;
    }

    // 1. STOP previous detection & set scanning state
    resetDetection();
    setDetectionPausedByRefresh(false);    // clear refresh-paused banner
    setDetectionStatus("SCANNING");

    try {
      // 2. Trigger Scan
      const result = await triggerScan(selectedNetwork);
      setLastScan(result);
      setLastScannedNetwork(selectedNetwork);

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
      const scanId = saveData.scan_id;        // From Supabase insert

       // Store both in React context (in-memory, not localStorage)
      setNetworkScan(networkId, scanId);

      alert(`Scan saved! Network ID: ${networkId}. Starting threat detection...`);
      
      // 4. Start Detection Phase
      setDetectionStatus("DETECTING");
      const normalizedBssid = (selectedNetwork.bssid || "").toUpperCase();
      console.log("Reloading vulnerabilities for BSSID:", normalizedBssid);
      await reloadVulnerabilities(normalizedBssid);
      console.log("Vulnerabilities after reload:", vulnerabilities);

      // 5. Show vulnerabilities first, then auto-switch to Threats after 5 seconds
      setActiveTab("vulnerabilities");
      setTimeout(() => {
        setActiveTab("threats");
      }, 5000);
    } catch (err) {
      console.error("Scan error:", err);
      alert("Scan failed");
      setDetectionStatus("IDLE");
    }
  };

  const saveSelectedNetwork = async () => {
    if (!selectedNetwork?.bssid || selectedNetwork?.channel === undefined) {
      alert("Select a full network first");
      return;
    }

    try {
      //const res = await fetch("/api/networks", {
      const res = await fetch("/api/rasPi/networks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssid: selectedNetwork.ssid,
          bssid: selectedNetwork.bssid,
          channel: selectedNetwork.channel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      alert("Network saved to DB!");
    } catch (err) {
      console.error(err);
      alert(`Save failed: ${err.message}`);
    }
  };

  const openThreatDetail = async (threat) => {
    const key =
      typeof threat?.id === "string" && threat.id.includes("-")
        ? threat.id // vt_code-like, e.g. WFVT-006
        : threat?.name;

    await fetchThreatDetail(key);
    setIsModalOpen(true);
  };

  const openVulnDetail = /* async  */(vuln) => {
    //await fetchVulnDetail(vuln.name);
    setIsModalOpen(true);
    fetchVulnDetail(vuln); // pass whole row
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const currentDetail = activeTab === "threats" ? threatDetail : vulnDetail;
  const detailLoading =
    activeTab === "threats" ? threatDetailLoading : vulnDetailLoading;

  const tabs = [
    { label: "Threats", value: "threats" },
    { label: "Vulnerabilities", value: "vulnerabilities" },
  ];

  return (
    <div className={activeTab === "vulnerabilities" ? "sam-layout" : "sam-page"}>
      <div className="sam-main">
        <h1 className="page-title">Security Assessment Management</h1>

        {/* STATUS BANNER */}
        {detectionPausedByRefresh && detectionStatus === "IDLE" && (
          <div
            className="status-banner paused"
            style={{
              background: "#fef3cd",
              color: "#856404",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "4px",
              border: "1px solid #856404",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Detection was paused due to page refresh. Start detection again to continue monitoring.</span>
            <button
              onClick={() => setDetectionPausedByRefresh(false)}
              style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "16px" }}
            >
              ✕
            </button>
          </div>
        )}

        {selectedNetwork?._notInRange && (
          <div
            className="status-banner warning"
            style={{
              background: "#fff3e0",
              color: "#e65100",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "4px",
              border: "1px solid #e65100",
            }}
          >
            Previously selected network "{selectedNetwork.ssid}" is no longer in range.
            Select a new network to scan.
          </div>
        )}

        {/* STATUS BANNER */}
        {detectionStatus === "DETECTING" && (
          <div
            className="status-banner detecting"
            style={{
              background: "#e6fffa",
              color: "#047857",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "4px",
              border: "1px solid #047857",
            }}
          >
            Scanning active... Monitoring for threats (
            {detectionResults?.results?.length || 0} found)
          </div>
        )}

        <div className="sam-header">
          <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {activeTab === "threats" && (
          <ThreatsTable threats={displayThreats} onView={openThreatDetail} />
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
          vulnerability={currentDetail}
          loading={detailLoading || !currentDetail}
        />
      )}
    </div>
  );
};

export default SAM;
