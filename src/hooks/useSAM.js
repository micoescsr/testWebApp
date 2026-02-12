// hooks/useSAM.js
//import { useState, useEffect } from "react";
import { useState, useEffect, useRef } from "react"; // Ensure useRef is imported
import {
  getThreats,
  getVulnerabilities,
  getThreatDetail,
  getVulnerabilityDetail,
} from "../api/samApi";

  export const useNetworks = () => {
    const [networks, setNetworks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cached, setCached] = useState(false) ;

  useEffect(() => {
    const fetchNetworks = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("http://localhost:3000/api/rasPi/networks_list");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} testing error`);
        }

        const body = await res.json(); // { status, networks, cached }

        if (body.status !== "OK") {
          throw new Error(body.error || "Backend returned ERROR");
        }

        setNetworks(body.networks || []);
        setCached(body.cached ?? false);
      } catch (err) {
        setError(err.message || "Failed to load networks");
      } finally {
        setLoading(false);
      }
    };

    fetchNetworks();
  }, []);

  return { networks, loading, error, cached };
};

/* =========================
   THREATS
========================= */
export const useThreats = () => {
  const [threats, setThreats] = useState([
    {
      id: 1,
      severity: "CRITICAL",
      name: "Rogue AP",
      detectedTime: "Nov 14, 2025",
      score: "8.0",
      occurrences: 1,
    },
  ]);

  const [threatDetail, setThreatDetail] = useState(null);
  const [threatsLoading, setThreatsLoading] = useState(false);
  const [threatDetailLoading, setThreatDetailLoading] = useState(false);
  const [threatError, setThreatError] = useState(null);

  useEffect(() => {
    const fetchThreats = async () => {
      try {
        setThreatsLoading(true);
        setThreatError(null);

        // TODO: uncomment when backend is ready
        // const res = await getThreats();
        // setThreats(res.data);

        // keep current mock as fallback
      } catch (err) {
        setThreatError(err.message || "Failed to load threats");
      } finally {
        setThreatsLoading(false);
      }
    };

    fetchThreats();
  }, []);

  const fetchThreatDetail = async (threatIdOrName) => {
    try {
      setThreatDetailLoading(true);
      setThreatError(null);

      // TODO: uncomment when detail endpoint is ready
      // const res = await getThreatDetail(threatIdOrName);
      // setThreatDetail(res.data);

      // Mock detail fallback
      if (threatIdOrName === "Rogue AP") {
        setThreatDetail({
          severity: "CRITICAL",
          name: "Rogue AP",
          cvss: "8.0",
          cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N",
          description:
            "A rogue access point is an unauthorized wireless access point that can allow attackers to intercept network traffic.",
          recommendations: {
            nist: [
              "Monitor wireless infrastructure and detect unauthorized access points...",
              "Segment guest networks from internal networks...",
            ],
            owasp: [
              "Use wireless intrusion detection systems (WIDS)...",
              "Harden access point configurations and disable unused services...",
            ],
          },
        });
      } else {
        setThreatDetail(null);
      }
    } catch (err) {
      setThreatError(err.message || "Failed to load threat detail");
    } finally {
      setThreatDetailLoading(false);
    }
  };

  return {
    threats,
    threatsLoading,
    threatError,
    threatDetail,
    threatDetailLoading,
    fetchThreatDetail,
  };
};

/* =========================
   VULNERABILITIES
========================= */
export const useVulnerabilities = (bssid) => {
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [vulnDetail, setVulnDetail] = useState(null);
  const [vulnsLoading, setVulnsLoading] = useState(false);
  const [vulnDetailLoading, setVulnDetailLoading] = useState(false);
  const [vulnError, setVulnError] = useState(null);

  const loadVulnerabilities = async (targetBssid) => {
    // if there is no selected network, show nothing
    if (!targetBssid) {
      setVulnerabilities([]);
      return;
    }

    try {
      setVulnsLoading(true);
      setVulnError(null);

      /* const url = bssid
        ? `/api/webApp/vulnerabilities_latest?bssid=${encodeURIComponent(
            bssid
          )}`
        : `/api/webApp/vulnerabilities_latest`; */

        const url = `/api/webApp/vulnerabilities_latest?bssid=${encodeURIComponent(
        targetBssid
      )}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = await res.json();
      if (body.status !== "OK") {
        throw new Error(body.error || "Backend returned ERROR");
      }

      console.log("vulns from backend", body.rows); // TEMP: see data shape
      //setVulnerabilities(body.rows || []);

      const deriveSeverity = (score) => {
        const n = Number(score);
        if (!Number.isFinite(n)) return "N/A";
        if (n >= 9) return "CRITICAL";
        if (n >= 7) return "HIGH";
        if (n >= 4) return "MEDIUM";
        return "LOW";
      };

      const mapped = (body.rows || []).map((r) => ({
        id: r.vt_id ?? r.id,
        name: r.vt_name ?? r.name,
        score: r.severity_score ?? r.score,
        observedConfig: r.vt_value ?? r.observedConfig,
        detectedTime: r.scan_start ?? r.detectedTime,
        bssid: r.bssid,
        severity: r.severity ?? deriveSeverity(r.severity_score),
      }));

      setVulnerabilities(mapped);

    } catch (err) {
      console.error("fetchVulnerabilities error:", err);
      setVulnError(err.message || "Failed to load vulnerabilities");
    } finally {
      setVulnsLoading(false);
    }
  };

   // 🔴 REMOVE this auto-load effect so nothing shows initially
  // useEffect(() => {
  //   loadVulnerabilities();
  // }, []);

  // reload whenever selected bssid changes
  useEffect(() => {
    loadVulnerabilities(bssid);
  }, [bssid]);  // ⬅ important: tied to selected network

  // ... keep fetchVulnDetail as you have it ...
  /* {
  id,             // vt_id
  severity,       // from details or "CRITICAL"
  name,           // vt_name (e.g. "Management Frame Protection")
  score,          // severity_score
  observedConfig, // vt_value (your vt_value column)
  detectedTime,   // scan_start
} */

  const fetchVulnDetail = async (vulnIdOrName) => {
    try {
      setVulnDetailLoading(true);
      setVulnError(null);
      
      // ✅ SAFE FALLBACK (WORKS NOW)
    setVulnDetail({
      severity: vulnRow?.severity ?? "N/A",
      name: vulnRow?.name ?? "Unknown Vulnerability",
      cvss: vulnRow?.score ?? "N/A",
      cvssVector: vulnRow?.cvssVector ?? "N/A",
      description:
        vulnRow?.description ??
        "Detailed information for this vulnerability is not yet available.",
      recommendations: vulnRow?.recommendations ?? { nist: [], owasp: [] },
      observedConfig: vulnRow?.observedConfig ?? "N/A",
      detectedTime: vulnRow?.detectedTime ?? null,
    });
  } catch (err) {
    console.error("fetchVulnDetail error:", err);
    setVulnError(err.message || "Failed to load vulnerability detail");
  } finally {
    setVulnDetailLoading(false);
  }
};

  return {
    vulnerabilities, //real data from backend
    vulnsLoading,
    vulnError,
    vulnDetail,
    vulnDetailLoading,
    fetchVulnDetail,
    reloadVulnerabilities: loadVulnerabilities, // <-- new
  };
  
};


/* =========================
   THREAT DETECTION HOOK (Smart Polling)
========================= */
export const useThreatDetection = () => {
  const [status, setStatus] = useState("IDLE"); // 'IDLE' | 'SCANNING' | 'DETECTING'
  const [detectionResults, setDetectionResults] = useState(null);
  const [liveThreats, setLiveThreats] = useState([]); // <-- ADD THIS

  // Refs track the "Live" status without causing re-renders
  const isPollingRef = useRef(false);
  const timeoutRef = useRef(null);

  // The actual polling function
  const runPoll = async () => {
    if (!isPollingRef.current) return;

    try {
      const res = await fetch("http://localhost:3000/api/detect/poll");
      const data = await res.json();

      if (isPollingRef.current) {
        setDetectionResults(data);
        setLiveThreats(data.threatRows || []); // <-- use backend mapping
      }
    } catch (err) {
      console.error("Polling error:", err);
    } finally {
      if (isPollingRef.current) {
        timeoutRef.current = setTimeout(runPoll, 2000);
      }
    }
  };

  const startPolling = () => {
    if (isPollingRef.current) return; // Already running
    isPollingRef.current = true;
    runPoll();
  };

  const stopPolling = () => {
    isPollingRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (status === "DETECTING") {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [status]);

  return {
    detectionStatus: status,
    setDetectionStatus: setStatus,
    detectionResults,
    liveThreats, // <-- RETURN IT
    resetDetection: () => {
      stopPolling();
      setStatus("IDLE");
      setDetectionResults(null);
      setLiveThreats([]); // clear live threats
    },
  };
};