// hooks/useDashboard.js
import { useState, useEffect, useCallback, useRef } from "react";
import {
  getDashboardSummary,
  getDashboardForNetwork,
  getNetworks,
} from "../api/dashboardApi";
import api from "../api/axios";
import { useApiResource } from "./useApiResource";

export const useDashboard = () => {
  // ΓöÇΓöÇ View mode: "Summary" or a network_id UUID ΓöÇΓöÇ
  const [viewMode, setViewMode] = useState("Summary");
  const [showLegend, setShowLegend] = useState(false);
  const isSummary = viewMode === "Summary";
  const toggleLegend = () => setShowLegend((prev) => !prev);

  // ΓöÇΓöÇ Shared hover state for linked highlighting ΓöÇΓöÇ
  const [hoverContext, setHoverContext] = useState(null);
  const clearHoverContext = () => setHoverContext(null);

  // ΓöÇΓöÇ Network list (for dropdown) ΓöÇΓöÇ
  const [networks, setNetworks] = useState([]);

  // ΓöÇΓöÇ Pi device status (online/offline) ΓöÇΓöÇ
  const [piStatus, setPiStatus] = useState({ online: null, data: null });
  const piPollRef = useRef(null);

  // ΓöÇΓöÇ Date filter: selected scan ΓöÇΓöÇ
  const [selectedScanId, setSelectedScanId] = useState(null);
  const [scanList, setScanList] = useState([]);

  // ΓöÇΓöÇ Summary Date: null = Latest, else "YYYY-MM-DD" (as-of summary) ΓöÇΓöÇ
  const [summaryDate, setSummaryDate] = useState(null);

  // ΓöÇΓöÇ Data state (null = not yet loaded) ΓöÇΓöÇ
  const [summary, setSummary] = useState(null);
  const [networkData, setNetworkData] = useState(null);

  const { loading, error, run } = useApiResource("Failed to load dashboard data");

  // ΓöÇΓöÇ Fetch network list once on mount ΓöÇΓöÇ
  useEffect(() => {
    let cancelled = false;
    const fetchNetworks = async () => {
      try {
        const res = await getNetworks();
        if (!cancelled) setNetworks(res.data || []);
      } catch (err) {
        console.error("Failed to fetch networks:", err);
      }
    };
    fetchNetworks();
    return () => { cancelled = true; };
  }, []);

  // ΓöÇΓöÇ Poll Pi device status every 30s ΓöÇΓöÇ
  useEffect(() => {
    let cancelled = false;
    const fetchPiStatus = async () => {
      try {
        const res = await api.get("/pi/device/status");
        if (!cancelled) setPiStatus({ online: true, data: res.data });
      } catch {
        if (!cancelled) setPiStatus({ online: false, data: null });
      }
    };
    fetchPiStatus();
    piPollRef.current = setInterval(fetchPiStatus, 30_000);
    return () => {
      cancelled = true;
      clearInterval(piPollRef.current);
    };
  }, []);

  // ΓöÇΓöÇ Reset selectedScanId when network changes ΓöÇΓöÇ
  const handleSetViewMode = useCallback((mode) => {
    setViewMode(mode);
    setSelectedScanId(null);
    setScanList([]);
    setSummaryDate(null); // view switches always land on Latest

    // Clear stale data so loading shows
    if (mode === "Summary") {
      setNetworkData(null);
    } else {
      setSummary(null);
    }
  }, []);

  // ΓöÇΓöÇ Main data fetch: runs on viewMode or selectedScanId change ΓöÇΓöÇ
  useEffect(() => {
    let cancelled = false;

    run(
      async () => {
        if (isSummary) {
          const res = await getDashboardSummary(summaryDate);
          if (!cancelled) setSummary(res.data);
        } else {
          const networkId = viewMode;
          const res = await getDashboardForNetwork(
            networkId,
            selectedScanId
          );
          if (!cancelled) {
            setNetworkData(res.data);
            // scanList comes from the per-network response
            if (res.data?.scanList) {
              setScanList(res.data.scanList);
            }
          }
        }
      },
      { isStale: () => cancelled }
    );

    return () => { cancelled = true; };
  }, [viewMode, isSummary, selectedScanId, summaryDate, run]);

  return {
    viewMode,
    setViewMode: handleSetViewMode,
    isSummary,
    showLegend,
    toggleLegend,
    loading,
    error,
    summary,
    networkData,
    hoverContext,
    setHoverContext,
    clearHoverContext,
    networks,
    scanList,
    selectedScanId,
    setSelectedScanId,
    summaryDate,
    setSummaryDate,
    piStatus,
  };
};
