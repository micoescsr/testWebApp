// hooks/useSAM.js
import { useState, useEffect } from "react";
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
export const useVulnerabilities = () => {
  const [vulnerabilities, setVulnerabilities] = useState([
    {
      id: 1,
      severity: "CRITICAL",
      name: "Unencrypted Network",
      score: "9.9",
      detectedTime: "Nov 15, 2025",
    },
  ]);

  const [vulnDetail, setVulnDetail] = useState(null);
  const [vulnsLoading, setVulnsLoading] = useState(false);
  const [vulnDetailLoading, setVulnDetailLoading] = useState(false);
  const [vulnError, setVulnError] = useState(null);

  useEffect(() => {
    const fetchVulnerabilities = async () => {
      try {
        setVulnsLoading(true);
        setVulnError(null);

        // TODO: uncomment when backend is ready
        // const res = await getVulnerabilities();
        // setVulnerabilities(res.data);

        // keep current mock as fallback
      } catch (err) {
        setVulnError(err.message || "Failed to load vulnerabilities");
      } finally {
        setVulnsLoading(false);
      }
    };

    fetchVulnerabilities();
  }, []);

  const fetchVulnDetail = async (vulnIdOrName) => {
    try {
      setVulnDetailLoading(true);
      setVulnError(null);

      // TODO: uncomment when detail endpoint is ready
      // const res = await getVulnerabilityDetail(vulnIdOrName);
      // setVulnDetail(res.data);

      // Mock detail fallback
      if (vulnIdOrName === "Unencrypted Network") {
        setVulnDetail({
          severity: "CRITICAL",
          name: "Unencrypted Network",
          cvss: "9.9",
          cvssVector: "CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:C/C:H/L:I/A:L",
          description:
            "An unencrypted network (open Wi-Fi) transmits traffic in cleartext because no WPA/WPA2/WPA3 encryption is used, allowing anyone in radio range to intercept or tamper with data.",
          recommendations: {
            nist: [
              "Use strong encryption and authentication for wireless communication...",
              "Separate WLAN networks by use case (e.g., guest/public vs internal/trusted)...",
              "Monitor the wireless infrastructure: perform periodic audits, detect unauthorized APs...",
            ],
            owasp: [
              "Implement WPA3 encryption where possible, falling back to WPA2 with strong passwords...",
              "Use certificate-based authentication (802.1X) for enterprise environments...",
              "Regularly update router firmware and disable WPS...",
            ],
          },
        });
      } else {
        setVulnDetail(null);
      }
    } catch (err) {
      setVulnError(err.message || "Failed to load vulnerability detail");
    } finally {
      setVulnDetailLoading(false);
    }
  };

  return {
    vulnerabilities,
    vulnsLoading,
    vulnError,
    vulnDetail,
    vulnDetailLoading,
    fetchVulnDetail,
  };
  
};
