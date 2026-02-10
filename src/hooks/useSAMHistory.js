/* // hooks/useSAMHistory.js
import { useState, useEffect } from "react";
import { getVulnHistory, getThreatHistory } from "../api/samHistoryApi";

export const useSAMHistory = () => {
  const [vulnHistory, setVulnHistory] = useState([]);
  const [threatHistory, setThreatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        // TODO: real API calls when ready
        // const [vulnRes, threatRes] = await Promise.all([
        //   getVulnHistory(),
        //   getThreatHistory(),
        // ]);
        // setVulnHistory(vulnRes.data);
        // setThreatHistory(threatRes.data);

        // Temporary mock (your existing arrays)
        setVulnHistory([
          {
            id: 1,
            datetime: "2025-11-14 11:10 AM",
            ssid: "Free_WiFi",
            summary: 1,
            details: [
              {
                severity: "CRITICAL",
                name: "Unencrypted Network",
                score: "8.0",
              },
            ],
          },
        ]);

        setThreatHistory([
          {
            id: 1,
            datetime: "2025-11-14 11:10 AM",
            ssid: "Free_WiFi",
            summary: 2,
            threats: [
              {
                severity: "CRITICAL",
                name: "Rogue AP",
                score: "8.0",
                occurrences: 1,
                window: "11:10 AM - 11:10 AM",
              }
            ],
          },
        ]);
      } catch (err) {
        setError(err.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return { vulnHistory, threatHistory, loading, error };
};
 */

// hooks/useSAMHistory.js
import { useState, useEffect } from "react";
import { getVulnHistory, getThreatHistory } from "../api/samHistoryApi";

export const useSAMHistory = () => {
  const [vulnHistory, setVulnHistory] = useState([]);
  const [threatHistory, setThreatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        const [vulnRes, threatRes] = await Promise.all([
          getVulnHistory(),
          getThreatHistory(),
        ]);

        setVulnHistory(vulnRes.data);
        setThreatHistory(threatRes.data);
      } catch (err) {
        setError(err.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return { vulnHistory, threatHistory, loading, error };
};
