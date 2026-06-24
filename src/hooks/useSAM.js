// hooks/useSAM.js
import { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/axios";
import { getThreatDetail, getVulnerabilityDetail } from "../api/samApi";
import { useSessionState } from "./useSessionState";
import { getApiErrorMessage } from "../utils/apiError";

/**
 * Available-networks hook with background auto-refresh.
 *
 * The Pi continuously scans and the backend (`GET /rasPi/networks_list/`)
 * returns the current AP list each call — there is no push/stream channel,
 * so newly detected APs surface via short-interval polling. Polling runs only
 * while this hook is mounted (i.e. the SAM sidebar is on screen) and pauses
 * when the tab is hidden, to avoid hammering the Pi when nobody is looking.
 *
 * @param {number} pollInterval ms between background refreshes (default 15000)
 */
export const useNetworks = (pollInterval = 15000) => {
  const [networks, setNetworks] = useState([]);
  const [cached, setCached] = useState(false);
  // `loading` is the INITIAL load only — it gates the full-card spinner.
  // Background refreshes use `refreshing` so the list never blanks mid-poll.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Monotonic request id: a slow in-flight request must never overwrite the
  // result of a newer one (race / stale-response protection).
  const reqSeqRef = useRef(0);
  // Guards against overlapping requests (e.g. a manual refresh firing while a
  // poll tick is already in flight) so we don't double-hit the backend.
  const inFlightRef = useRef(false);
  // Once we have served data at least once, background failures keep the last
  // known list instead of clearing it.
  const hasDataRef = useRef(false);

  const fetchNetworks = useCallback(async ({ background = false } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const seq = ++reqSeqRef.current;

    if (background) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.get("/rasPi/networks_list/");
      const body = res.data; // { status, networks, cached }

      // A newer request already resolved — discard this stale response.
      if (seq !== reqSeqRef.current) return;

      if (body.status !== "OK") {
        throw new Error(body.error || "Backend returned ERROR");
      }

      setNetworks(body.networks || []);
      setCached(body.cached ?? false);
      setLastUpdated(Date.now());
      setError(null);
      hasDataRef.current = true;
    } catch (err) {
      if (seq !== reqSeqRef.current) return;
      // Keep the last known list visible on refresh failure; the error is
      // surfaced as a small non-intrusive notice in the sidebar.
      setError(getApiErrorMessage(err, "Failed to load networks"));
    } finally {
      if (seq === reqSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, []);

  // Initial load + background polling loop. Pauses while the tab is hidden and
  // does an immediate refresh when it becomes visible again.
  useEffect(() => {
    fetchNetworks();

    let intervalId = null;
    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(
        () => fetchNetworks({ background: true }),
        pollInterval,
      );
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        fetchNetworks({ background: true });
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
      // Invalidate any in-flight request so it can't setState after unmount.
      reqSeqRef.current++;
    };
  }, [fetchNetworks, pollInterval]);

  const refetchNetworks = () => fetchNetworks({ background: hasDataRef.current });

  return {
    networks,
    loading,
    refreshing,
    error,
    cached,
    lastUpdated,
    refetchNetworks,
  };
};

/* =========================
   THREATS
========================= */
export const useThreats = () => {
  const [threatDetail, setThreatDetail] = useState(null);
  const [threatDetailLoading, setThreatDetailLoading] = useState(false);
  const [threatError, setThreatError] = useState(null);

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
      sessionStorage.setItem(key, new Date().toISOString());
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
      const clearedAfter = sessionStorage.getItem(clearedKey);

      const url = `/webapp/vulnerabilities_latest?bssid=${encodeURIComponent(
        targetBssid,
      )}`;

      const { default: api } = await import("../api/axios");
      const res = await api.get(url);

      const body = res.data;
      if (body.status !== "OK") {
        throw new Error(body.error || "Backend returned ERROR");
      }

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
          const detectedMs = v.detectedTime
            ? new Date(v.detectedTime).getTime()
            : 0;
          return detectedMs > clearedMs;
        });
      }

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
  }, [bssid]); // ⬅ important: tied to selected network

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
              description:
                res.data.description ?? defaultVulnDescription(vulnRow),
              recommendations: res.data.recommendations ?? [],
              observedConfig: vulnRow?.observedConfig ?? "N/A",
              detectedTime: vulnRow?.detectedTime ?? null,
            });
            return; // success — done
          }
        } catch (apiErr) {
          console.warn(
            "API detail fetch failed, using local fallback:",
            apiErr,
          );
        }
      }

      // Fallback: build detail from the row data we already have
      setVulnDetail({
        severity: vulnRow?.severity ?? "N/A",
        name: vulnRow?.name ?? "Unknown Vulnerability",
        cvss: vulnRow?.score ?? "N/A",
        cvssVector: "N/A",
        description: defaultVulnDescription(vulnRow),
        recommendations: [],
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
    if (!row)
      return "Detailed information for this vulnerability is not yet available.";
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
   THREAT DETECTION HOOK (Persistent — backed by detection_state table)
========================= */
export const useThreatDetection = () => {
  // UI status: 'IDLE' | 'SCANNING' | 'DETECTING' | 'FAILED'
  const [status, setStatus] = useState("IDLE");
  const [detectionResults, setDetectionResults] = useState(null);
  const [failureReason, setFailureReason] = useState(null);

  // Tracks whether the user has actually started a scan in THIS browser
  // session. Session-scoped (sessionStorage via wf: prefix) so it survives a
  // refresh but resets on a fresh session/logout. Used to distinguish a real
  // current-session failure from a stale FAILED row left over on the backend
  // from a previous run — the latter must NOT surface as a page-level error.
  const [hasStartedScan, setHasStartedScan] = useSessionState(
    "wf:hasStartedScan",
    false,
  );
  const markScanStarted = () => setHasStartedScan(true);

  // 1) live snapshot from the latest poll
  const [liveThreats, setLiveThreats] = useState([]);

  // 2) sticky/latest-known threats (what you show in UI)
  const [displayThreats, setDisplayThreats] = useState([]);

  // 3) backend state row (for callers that need network_id etc.)
  const [backendState, setBackendState] = useState(null);

  // Refs track the polling loop without causing re-renders
  const isPollingRef = useRef(false);
  const timeoutRef = useRef(null);
  const bootstrappedRef = useRef(false);

  // ─── Bootstrap: hydrate from /detect/status on mount ──────────
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    (async () => {
      try {
        const { default: api } = await import("../api/axios");
        const res = await api.get("/detect/status");
        const row = res.data;
        setBackendState(row);

        if (row.status === "RUNNING") {
          setStatus("DETECTING");
          setFailureReason(null);
        } else if (row.status === "FAILED" && hasStartedScan) {
          // Only surface a backend FAILED row if the user actually started a
          // scan this session. Otherwise it's a stale failure from a prior run
          // and should be treated as historical (idle), not a current error.
          setStatus("FAILED");
          setFailureReason(row.failure_reason || "Unknown failure");
        } else {
          setStatus("IDLE");
          setFailureReason(null);
        }
      } catch (err) {
        console.warn(
          "[useThreatDetection] bootstrap /detect/status failed:",
          err.message,
        );
        // Stay IDLE — will try again on next poll or scan
      }
    })();
  }, []);

  // ─── Polling with axios ───────────────────────────────────────
  const runPoll = async () => {
    if (!isPollingRef.current) return;

    try {
      const { default: api } = await import("../api/axios");
      const res = await api.get("/detect/poll");
      const data = res.data;

      // If backend says detection is no longer RUNNING, stop polling
      if (data.status && data.status !== "RUNNING") {
        isPollingRef.current = false;
        if (data.status === "FAILED") {
          setStatus("FAILED");
          setFailureReason(data.last_error || "Detection failed");
        } else if (data.status === "STOPPED") {
          setStatus("IDLE");
          setFailureReason(null);
        }
        setBackendState((prev) => ({ ...prev, status: data.status }));
        return; // don't schedule next poll
      }

      if (isPollingRef.current) {
        const threatRows = data.threatRows || [];
        const mapped = mapThreatRowsToParentSessions(threatRows);

        setDetectionResults(data);
        setLiveThreats(mapped);

        // Merge new poll results with existing display threats so sessions
        // accumulate across polls instead of being replaced wholesale.
        setDisplayThreats((prev) => mergeThreats(prev, mapped));
      }
    } catch (err) {
      console.error("Polling error:", err);
    } finally {
      if (isPollingRef.current) {
        timeoutRef.current = setTimeout(runPoll, 3000); // 3 s interval
      }
    }
  };

  /**
   * Merge newly-polled threats into the existing display list.
   * - New threat ids are appended
   * - Existing threats get their sessions merged (de-duped by firstSeen)
   *   and their status/score updated from the latest poll
   */
  function mergeThreats(prev, incoming) {
    if (!incoming || incoming.length === 0) return prev;
    if (!prev || prev.length === 0) return incoming;

    const merged = new Map();
    // Seed with existing threats
    for (const t of prev) merged.set(t.id, { ...t });

    for (const t of incoming) {
      if (!merged.has(t.id)) {
        merged.set(t.id, { ...t });
      } else {
        const existing = merged.get(t.id);
        // Update live fields from latest poll
        existing.status = t.status;
        existing.score = t.score ?? existing.score;
        existing.severity = t.severity ?? existing.severity;
        existing.detectedTime = t.detectedTime ?? existing.detectedTime;
        existing.activeCount = t.activeCount;
        existing.activeSession = t.activeSession;
        existing.raw = t.raw;

        // Merge sessions: add any new sessions (by firstSeen) that don't exist yet
        const existingFirstSeens = new Set(
          (existing.sessions || []).map((s) => s.firstSeen),
        );
        for (const s of t.sessions || []) {
          if (!existingFirstSeens.has(s.firstSeen)) {
            existing.sessions.push(s);
          } else {
            // Update existing session (e.g., DETECTED → CLEARED, duration extended)
            const idx = existing.sessions.findIndex(
              (es) => es.firstSeen === s.firstSeen,
            );
            if (idx !== -1) {
              existing.sessions[idx] = s;
            }
          }
        }
        // Re-sort sessions newest first
        existing.sessions.sort((a, b) => {
          const aKey = a.lastSeen || a.firstSeen;
          const bKey = b.lastSeen || b.firstSeen;
          return bKey - aKey;
        });
        // Recompute occurrences from accumulated sessions
        existing.occurrences = existing.sessions.filter(
          (s) => s.state === "CLEARED",
        ).length;
      }
    }
    return Array.from(merged.values());
  }

  // Helper: transform server threatRows into parent/session model
  function toEpochSeconds(v) {
    if (v == null) return null;
    if (typeof v === "number") {
      return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
    }
    const parsed = Date.parse(v);
    return isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }

  function mapThreatRowsToParentSessions(rows) {
    if (!Array.isArray(rows)) return [];
    const nowSec = Math.floor(Date.now() / 1000);

    return rows.map((t) => {
      const rawSessions = Array.isArray(t.sessions)
        ? t.sessions
        : t.sessions || [];

      const sessions = rawSessions
        .map((s) => {
          const first = toEpochSeconds(
            s.firstSeen ??
              s.first_seen ??
              s.first_seen_epoch ??
              s.firstSeenEpoch,
          );
          const last = toEpochSeconds(
            s.lastSeen ?? s.last_seen ?? s.last_seen_epoch ?? s.lastSeenEpoch,
          );
          const state = s.state || s.status || (last ? "CLEARED" : "DETECTED");
          const duration = first
            ? last
              ? last - first
              : nowSec - first
            : null;
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
          return bKey - aKey;
        });

      const occurrencesCompleted = sessions.filter(
        (s) => s.state === "CLEARED",
      ).length;
      const activeSession =
        sessions.find((s) => s.state === "DETECTED") || null;
      const lastSeen = activeSession
        ? activeSession.lastSeen || nowSec
        : sessions[0]?.lastSeen || sessions[0]?.firstSeen || null;

      return {
        id: t.id || t.vt_id || t.code || t.name,
        name: t.name || t.vt_name || t.vtName || "Unknown",
        severity: t.severity || t.severity_rating || "N/A",
        score: t.score ?? t.severity_score ?? null,
        status: t.status || (activeSession ? "DETECTED" : "CLEARED"),
        detectedTime: lastSeen,
        occurrences: occurrencesCompleted,
        activeCount: activeSession ? 1 : 0,
        activeSession,
        sessions,
        raw: t,
      };
    });
  }

  const startPolling = () => {
    if (isPollingRef.current) return;
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

  // Start/stop polling when status changes
  useEffect(() => {
    if (status === "DETECTING") {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [status]);

  /** Refresh detection state from backend (call after scan save). */
  const refreshStatus = async () => {
    try {
      const { default: api } = await import("../api/axios");
      const res = await api.get("/detect/status");
      const row = res.data;
      setBackendState(row);

      if (row.status === "RUNNING") {
        setStatus("DETECTING");
        setFailureReason(null);
      } else if (row.status === "FAILED") {
        setStatus("FAILED");
        setFailureReason(row.failure_reason || "Unknown failure");
      } else {
        setStatus("IDLE");
        setFailureReason(null);
      }
    } catch (err) {
      console.warn("[refreshStatus] failed:", err.message);
    }
  };

  return {
    detectionStatus: status,
    setDetectionStatus: setStatus,
    detectionResults,
    liveThreats,
    displayThreats,
    failureReason,
    backendState,
    refreshStatus,
    hasStartedScan,
    markScanStarted,
    // Page-level error visibility: only true for a failure tied to a scan the
    // user started this session — never for a stale backend FAILED row.
    shouldShowDetectionError: status === "FAILED" && hasStartedScan,
    resetDetection: () => {
      stopPolling();
      setStatus("IDLE");
      setDetectionResults(null);
      setLiveThreats([]);
      setDisplayThreats([]);
      setFailureReason(null);
    },
  };
};
