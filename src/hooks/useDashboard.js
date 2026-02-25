// hooks/useDashboard.js
import { useState, useEffect } from "react";
import { getDashboardSummary, getDashboardForNetwork } from "../api/dashboardApi";
import { supabase } from "../lib/supabaseClient";
import { getScansForNetwork } from "../api/scansApi";

// raw is a timestamp with timezone from Supabase, already ISO-compatible
const normalizeScanDate = (raw) => {
  if (!raw) return null;
  return new Date(raw);
};

export const useDashboard = () => {
  const [viewMode, setViewMode] = useState("Summary");
  const [showLegend, setShowLegend] = useState(false);
  const isSummary = viewMode === "Summary";
  const toggleLegend = () => setShowLegend((prev) => !prev);

  const [hoverContext, setHoverContext] = useState(null);
  const clearHoverContext = () => setHoverContext(null);

  const [networks, setNetworks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [scanOptions, setScanOptions] = useState([]);
  const [selectedScanId, setSelectedScanId] = useState(null);

useEffect(() => {
  const summary = viewMode === "Summary";
  if (!summary) {
    const loadScans = async () => {
      const scans = await getScansForNetwork(viewMode);

      const seenDates = new Set();
      const options = [];

      for (const s of scans) {
        const d = normalizeScanDate(s.created_at);
        if (!d) continue;

        // key per calendar day: "2026-02-25"
        const key = d.toISOString().slice(0, 10);

        if (seenDates.has(key)) continue;     // skip other scans on same day
        seenDates.add(key);

        options.push({
          id: s.scan_id,                      // first scan for that day
          label: d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),                                // "February 25, 2026"
        });
      }

      setScanOptions(options);
      if (options.length) setSelectedScanId(options[0].id);
    };

    loadScans();
  } else {
    setScanOptions([]);
    setSelectedScanId(null);
  }
}, [viewMode]);



  // Fetch network list for the dropdown on mount
  useEffect(() => {
    const fetchNetworks = async () => {
      const { data, error } = await supabase
        .from("networks")
        .select("network_id, ssid")
        .order("ssid", { ascending: true });
      if (!error && data) setNetworks(data);
    };
    fetchNetworks();
  }, []);


  // Fetch dashboard data whenever viewMode changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);


        if (isSummary) {
          const data = await getDashboardSummary();
          setSummary(data);
        } else {
          // viewMode is the network_id when not Summary
          const data = await getDashboardForNetwork(viewMode);
          setNetworkData(data);
        }
      } catch (err) {
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };


    fetchData();
  }, [viewMode, isSummary]);


  return {
    viewMode,
    setViewMode,
    isSummary,
    showLegend,
    toggleLegend,
    loading,
    error,
    summary,
    networkData,
    networks,       // for the dropdown
    hoverContext,
    setHoverContext,
    clearHoverContext,
        scanOptions,
    selectedScanId,
    setSelectedScanId,
  };
};