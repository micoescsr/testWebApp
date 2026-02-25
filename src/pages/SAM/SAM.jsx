// pages/SAM.jsx
import { useEffect, useState } from "react";
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

const SAM = () => {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  const [lastScannedNetwork, setLastScannedNetwork] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastScan, setLastScan] = useState(null);
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

    // Fetch metadata with encoded query and cancellation support
    const controller = new AbortController();
    try {
      const url = `/api/webapp/network_metadata?bssid=${encodeURIComponent(
        net.bssid || ""
      )}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        console.warn(`Metadata fetch failed: ${res.status}`);
        setLocationMeta({ city: "", province: "", notes: "" });
        return;
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setLocationMeta({ city: "", province: "", notes: "" });
        return;
      }

      const data = await res.json();
      setLocationMeta({
        city: data.city || "",
        province: data.province || "",
        notes: data.notes || "",
      });
    } catch (e) {
      if (e.name === "AbortError") {
        console.log("Metadata fetch aborted");
      } else {
        console.error("Failed to load metadata:", e);
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

       // ✅ Store for later use by DeviceManagement
      localStorage.setItem("lastNetworkId", networkId);

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
