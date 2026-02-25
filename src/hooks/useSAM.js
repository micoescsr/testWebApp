// hooks/useSAM.js
//import { useState, useEffect } from "react";
import { useState, useEffect, useRef } from "react"; // Ensure useRef is imported
import {
  getThreats,
  getVulnerabilities,
  getThreatDetail,
  getVulnerabilityDetail,
} from "../api/samApi";
import { mappedThreats } from "../data/mockThreats";

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

      const res = await getThreatDetail(threatIdOrName);
      setThreatDetail(res.data);
    } catch (err) {
      setThreatError(err.message || "Failed to load threat detail");
      setThreatDetail(null);
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

  /** Clear vulnerabilities from the SAM view for a given BSSID.
   *  Persists a timestamp in localStorage so old results stay hidden after refresh. */
  const clearVulnerabilities = (targetBssid) => {
    if (targetBssid) {
      const key = `sam_cleared_${targetBssid.toUpperCase()}`;
      localStorage.setItem(key, new Date().toISOString());
    }
    setVulnerabilities([]);
  };

  const loadVulnerabilities = async (targetBssid) => {
    // if there is no selected network, show nothing
    if (!targetBssid) {
      setVulnerabilities([]);
      return;
    }

    try {
      setVulnsLoading(true);
      setVulnError(null);

      // Check if the user previously cleared results for this BSSID
      const clearedKey = `sam_cleared_${targetBssid.toUpperCase()}`;
      const clearedAfter = localStorage.getItem(clearedKey);

      const url = `/api/webapp/vulnerabilities_latest?bssid=${encodeURIComponent(
        targetBssid
      )}`;

      console.log("[loadVulnerabilities] fetching:", url);
      const res = await fetch(url);
      console.log("[loadVulnerabilities] response status:", res.status);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = await res.json();
      console.log("[loadVulnerabilities] response body:", JSON.stringify(body).slice(0, 500));
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

      let mapped = (body.rows || []).map((r) => ({
        id: r.vt_id ?? r.id,
        name: r.vt_name ?? r.name,
        score: r.severity_score ?? r.score,
        observedConfig: r.vt_value ?? r.observedConfig,
        detectedTime: r.scan_start ?? r.detectedTime,
        scan_id: r.scan_id ?? null,
        bssid: r.bssid,
        severity: r.severity ?? deriveSeverity(r.severity_score),
      }));

      // Filter out vulnerabilities that were detected before the user cleared the list
      if (clearedAfter) {
        const clearedMs = new Date(clearedAfter).getTime();
        mapped = mapped.filter((v) => {
          const detectedMs = v.detectedTime ? new Date(v.detectedTime).getTime() : 0;
          return detectedMs > clearedMs;
        });
      }

      setVulnerabilities(mapped);
      console.log("[loadVulnerabilities] mapped rows:", mapped.length, mapped);

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

  const fetchVulnDetail = async (vulnRow) => {
    try {
      setVulnDetailLoading(true);
      setVulnError(null);

      // Try fetching rich details from DB via API
      // Prefer name (matches vt_name) over id (numeric DB row ID)
      const lookupKey = vulnRow?.name || vulnRow?.id;
      if (lookupKey) {
        try {
          const res = await getVulnerabilityDetail(lookupKey);
          if (res?.data) {
            setVulnDetail({
              severity: res.data.severity ?? vulnRow?.severity ?? "N/A",
              name: res.data.name ?? vulnRow?.name ?? "Unknown Vulnerability",
              cvss: res.data.cvss ?? vulnRow?.score ?? "N/A",
              cvssVector: res.data.cvssVector ?? "N/A",
              description: res.data.description ?? defaultVulnDescription(vulnRow),
              recommendations: res.data.recommendations ?? { nist: [], owasp: [] },
              observedConfig: vulnRow?.observedConfig ?? "N/A",
              detectedTime: vulnRow?.detectedTime ?? null,
            });
            return; // success — done
          }
        } catch (apiErr) {
          console.warn("API detail fetch failed, using local fallback:", apiErr);
        }
      }

      // Fallback: build detail from the row data we already have
      setVulnDetail({
        severity: vulnRow?.severity ?? "N/A",
        name: vulnRow?.name ?? "Unknown Vulnerability",
        cvss: vulnRow?.score ?? "N/A",
        cvssVector: "N/A",
        description: defaultVulnDescription(vulnRow),
        recommendations: { nist: [], owasp: [] },
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

  /** Helper to generate a default description from the row data */
  function defaultVulnDescription(row) {
    if (!row) return "Detailed information for this vulnerability is not yet available.";
    return `${row.name || "This vulnerability"} was detected during analysis. Observed configuration: ${row.observedConfig || "N/A"}. Review and apply the recommendations to mitigate risk.`;
  }

  return {
    vulnerabilities, //real data from backend
    vulnsLoading,
    vulnError,
    vulnDetail,
    vulnDetailLoading,
    fetchVulnDetail,
    reloadVulnerabilities: loadVulnerabilities, // <-- new
    clearVulnerabilities, // <-- clear SAM view
  };
  
};


/* =========================
   THREAT DETECTION HOOK (Smart Polling)
========================= */
export const useThreatDetection = () => {
  const [status, setStatus] = useState("IDLE"); // 'IDLE' | 'SCANNING' | 'DETECTING'
  const [detectionResults, setDetectionResults] = useState(null);
  
  // 1) live snapshot from the latest poll
  const [liveThreats, setLiveThreats] = useState([]);

  // 2) sticky/latest-known threats (what you show in UI)
  // Use mock data in development when REACT_APP_USE_MOCK_THREATS is true
  let USE_MOCK_THREATS = false;
  try {
    // Prefer explicit VITE/REACT flag, but enable mocks automatically during Vite dev mode
    const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
    const rawFlag = env.VITE_USE_MOCK_THREATS ?? env.REACT_APP_USE_MOCK_THREATS ?? null;

    if (rawFlag != null) {
      USE_MOCK_THREATS = String(rawFlag).toLowerCase() === "true";
    } else if (env.DEV) {
      // developer convenience: show mock threats during local dev
      USE_MOCK_THREATS = true;
    } else if (typeof process !== "undefined" && process.env) {
      USE_MOCK_THREATS = String(process.env.REACT_APP_USE_MOCK_THREATS || "false").toLowerCase() === "true";
    } else {
      USE_MOCK_THREATS = false;
    }
  } catch (e) {
    USE_MOCK_THREATS = false;
  }

  const [displayThreats, setDisplayThreats] = useState(
    USE_MOCK_THREATS ? mappedThreats : []
  );

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
      const threatRows = data.threatRows || [];

      // Map raw threatRows into parent/session structure
      const mapped = mapThreatRowsToParentSessions(threatRows);

      setDetectionResults(data);
      setLiveThreats(mapped); // live snapshot (mapped)

      // only update sticky state when we *have* threats
      if (mapped.length > 0) {
        setDisplayThreats(mapped); // last non-empty mapped
      }
    }
  } catch (err) {
    console.error("Polling error:", err);
  } finally {
    if (isPollingRef.current) {
      timeoutRef.current = setTimeout(runPoll, 2000);
    }
  }
};

  // Helper: transform server threatRows into parent/session model
  function toEpochSeconds(v) {
    if (v == null) return null;
    if (typeof v === "number") {
      // seconds vs ms heuristic
      return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
    }
    const parsed = Date.parse(v);
    return isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }

  function mapThreatRowsToParentSessions(rows) {
    if (!Array.isArray(rows)) return [];
    const nowSec = Math.floor(Date.now() / 1000);

    return rows.map((t) => {
      const rawSessions = Array.isArray(t.sessions) ? t.sessions : t.sessions || [];

      const sessions = rawSessions
        .map((s) => {
          const first = toEpochSeconds(s.firstSeen ?? s.first_seen ?? s.first_seen_epoch ?? s.firstSeenEpoch);
          const last = toEpochSeconds(s.lastSeen ?? s.last_seen ?? s.last_seen_epoch ?? s.lastSeenEpoch);
          const state = s.state || s.status || (last ? "CLEARED" : "DETECTED");
          const duration = first ? (last ? last - first : nowSec - first) : null;
          return {
            firstSeen: first,
            lastSeen: last,
            durationSeconds: duration,
            state,
            raw: s,
          };
        })
        .filter((x) => x.firstSeen != null)
        .sort((a, b) => {
          const aKey = a.lastSeen || a.firstSeen;
          const bKey = b.lastSeen || b.firstSeen;
          return bKey - aKey; // newest first
        });

      const occurrencesCompleted = sessions.filter((s) => s.state === "CLEARED").length;
      const activeSession = sessions.find((s) => s.state === "DETECTED") || null;

      const lastSeen = activeSession ? (activeSession.lastSeen || nowSec) : (sessions[0]?.lastSeen || sessions[0]?.firstSeen || null);

      return {
        id: t.id || t.vt_id || t.code || t.name,
        name: t.name || t.vt_name || t.vtName || "Unknown",
        severity: t.severity || t.severity_rating || "N/A",
        score: t.score ?? t.severity_score ?? null,
        status: t.status || (activeSession ? "DETECTED" : "CLEARED"),
        detectedTime: lastSeen, // used by table as detectedTime
        occurrences: occurrencesCompleted,
        activeCount: activeSession ? 1 : 0,
        activeSession,
        sessions,
        raw: t,
      };
    });
  }


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
    liveThreats,      // “raw” current poll
    displayThreats,   // “sticky” for UI
    resetDetection: () => {
      stopPolling();
      setStatus("IDLE");
      setDetectionResults(null);
      setLiveThreats([]); // clear live threats
      setDisplayThreats([]); // clear sticky threats
    },
  };
};