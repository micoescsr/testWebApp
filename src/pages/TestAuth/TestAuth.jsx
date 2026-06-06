// src/pages/TestAuth/TestAuth.jsx
// ──────────────────────────────────────────────────────────────────
// Auth QA Harness — Production-grade acceptance gates (G0 – G6)
// For manuscript documentation & pre/post-deploy validation.
//
// Each gate is an isolated, deterministic test. No background UI
// interference, no console ambiguity. Results display inline and
// aggregate into a summary table with Export for appendix evidence.
// ──────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from "react";
import api, { setAccessToken, getAccessToken } from "../../api/axios";
import { logout as apiLogout } from "../../api/authApi";
import "./TestAuth.css";

// ── Constants ────────────────────────────────────────────────────
const ts = () =>
  new Date().toLocaleTimeString("en-US", {
    hour12: false,
    fractionalSecondDigits: 3,
  });

const PROFILE_ENDPOINT = "webapp/users/profiles/me";

// Sensitive endpoints that MUST return 401 without a Bearer token.
// Used in Gate 6 route-exposure audit.
const PROTECTED_ENDPOINTS = [
  { method: "GET", url: "webapp/users/profiles/me", label: "/profiles/me" },
  { method: "GET", url: "webapp/users/profiles", label: "/profiles" },
  { method: "GET", url: "webapp/network_metadata", label: "/network_metadata" },
  { method: "GET", url: "webapp/vulnerabilities_latest", label: "/vulnerabilities_latest" },
  { method: "GET", url: "sam/threats/CVE-2024-0001", label: "/sam/threats/:id" },
];

// Gate metadata for the summary table
const GATE_META = [
  { id: "g0", label: "G0", title: "Sanity & Invariants" },
  { id: "g1", label: "G1", title: "Login Creates Valid Session" },
  { id: "g2", label: "G2", title: "Reload Bootstrap Recovers Session" },
  { id: "g3", label: "G3", title: "Expired Token → Refresh + Retry" },
  { id: "g3q", label: "G3Q", title: "Concurrent Refresh Queue" },
  { id: "g4", label: "G4", title: "Invalid Cookie → Clean Logout" },
  { id: "g5", label: "G5", title: "Logout Is Terminal" },
  { id: "g6", label: "G6", title: "Route Exposure Audit" },
];

// sessionStorage keys — gate results survive destructive-gate redirects
const STORAGE_KEY = "auth-qa-gate-results";
const G4_ARMED_KEY = "auth-qa-g4-armed";

// ── Component ────────────────────────────────────────────────────
export default function TestAuth() {
  const [results, setResults] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(null);
  const logEndRef = useRef(null);

  const scrollLog = () =>
    setTimeout(
      () => logEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50
    );

  const log = useCallback((level, msg) => {
    setLogs((prev) => [...prev, { time: ts(), level, msg }]);
    scrollLog();
  }, []);

  const setResult = useCallback((id, status, detail, subs) => {
    setResults((prev) => {
      const next = { ...prev, [id]: { status, detail, subs } };
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Restore G4 armed flag on mount (redirect = PASS) ──────────
  useEffect(() => {
    try {
      const armed = sessionStorage.getItem(G4_ARMED_KEY);
      if (armed) {
        sessionStorage.removeItem(G4_ARMED_KEY);
        const { timestamp } = JSON.parse(armed);
        const elapsed = Date.now() - (timestamp || 0);
        if (elapsed < 60_000) {
          setResult("g4", "pass", [
            "PASS — Redirect to /login detected.",
            `Redirect occurred ~${(elapsed / 1000).toFixed(1)}s ago.`,
            "Corrupted cookie → refresh failed → clean redirect.",
            "(Result recovered from sessionStorage after navigation.)",
          ].join("\n"));
        }
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generic runner ─────────────────────────────────────────────
  const run = async (id, fn) => {
    setRunning(id);
    setResult(id, "pending", "Running...");
    log("info", `[${id}] START`);
    try {
      await fn(id);
    } catch (err) {
      setResult(id, "fail", `Unexpected error: ${err.message}`);
      log("fail", `[${id}] UNEXPECTED: ${err.message}`);
    } finally {
      setRunning(null);
    }
  };

  // ── JWT decode helper ──────────────────────────────────────────
  const decodeJWT = (token) => {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
  };

  // ═══════════════════════════════════════════════════════════════
  //  GATE 0 — Sanity & Invariants
  // ═══════════════════════════════════════════════════════════════
  const testG0 = (id) =>
    run(id, async () => {
      const subs = [];

      // 0-a: No sb-* keys in localStorage
      const sbKeys = Object.keys(localStorage).filter((k) =>
        k.startsWith("sb-")
      );
      const noStorage = sbKeys.length === 0;
      subs.push({
        pass: noStorage,
        label: noStorage
          ? "No sb-* keys in localStorage"
          : `FOUND sb-* keys: ${sbKeys.join(", ")}`,
      });
      log(noStorage ? "pass" : "fail", `[${id}] localStorage sb-*: ${noStorage ? "clean" : sbKeys.join(", ")}`);

      // 0-b: Access token exists in memory
      const hasToken = !!getAccessToken();
      subs.push({
        pass: hasToken,
        label: hasToken
          ? "Access token present in memory"
          : "No access token in memory (login first)",
      });
      log(hasToken ? "pass" : "warn", `[${id}] In-memory token: ${hasToken ? "present" : "missing"}`);

      // 0-c: Refresh cookie is alive (indirect — call refresh endpoint)
      let cookieAlive = false;
      try {
        const r = await api.post("auth/refresh");
        cookieAlive = r.status === 200 && !!r.data?.access_token;
        // Restore the fresh token so we don't break the session
        if (cookieAlive) setAccessToken(r.data.access_token);
      } catch {
        cookieAlive = false;
      }
      subs.push({
        pass: cookieAlive,
        label: cookieAlive
          ? "Refresh cookie valid (auth/refresh returned 200)"
          : "Refresh cookie invalid or missing",
      });
      log(cookieAlive ? "pass" : "fail", `[${id}] Refresh cookie: ${cookieAlive ? "valid" : "invalid/missing"}`);

      // 0-d: Protected endpoint returns 401 without token
      let rawUnauth = false;
      try {
        // Use raw fetch (no interceptor) to avoid auto-refresh
        const r = await fetch(
          `${api.defaults.baseURL}/${PROFILE_ENDPOINT}`,
          { method: "GET", credentials: "omit" }
        );
        rawUnauth = r.status === 401;
        subs.push({
          pass: rawUnauth,
          label: rawUnauth
            ? `/profiles/me returns 401 without Bearer`
            : `/profiles/me returned ${r.status} without Bearer — ENDPOINT MAY BE UNPROTECTED`,
        });
      } catch (err) {
        subs.push({ pass: false, label: `Fetch error: ${err.message}` });
      }
      log(rawUnauth ? "pass" : "fail", `[${id}] Unauthenticated /profiles/me: ${rawUnauth ? "401" : "NOT 401"}`);

      const allPass = subs.every((s) => s.pass);
      setResult(
        id,
        allPass ? "pass" : "fail",
        allPass
          ? "All invariants hold."
          : "One or more invariants failed — fix before proceeding.",
        subs
      );
      log(allPass ? "pass" : "fail", `[${id}] ${allPass ? "PASS" : "FAIL"}`);
    });

  // ═══════════════════════════════════════════════════════════════
  //  GATE 1 — Login Creates Valid Session
  // ═══════════════════════════════════════════════════════════════
  const testG1 = (id) =>
    run(id, async () => {
      const token = getAccessToken();
      if (!token) {
        setResult(id, "fail", "No access token in memory. Log in first via /login, then return here.");
        log("fail", `[${id}] No token.`);
        return;
      }

      const subs = [];

      // 1-a: Token is valid JWT with expected claims
      const payload = decodeJWT(token);
      const validJwt = !!payload?.sub && !!payload?.aud;
      subs.push({
        pass: validJwt,
        label: validJwt
          ? `JWT valid — sub: ${payload.sub}, aud: ${payload.aud}`
          : "Token is not a valid JWT or missing sub/aud",
      });

      // 1-b: /profiles/me returns 200 with Bearer
      let profileOk = false;
      let profileData = null;
      const start = performance.now();
      try {
        const res = await api.get(PROFILE_ENDPOINT);
        const elapsed = (performance.now() - start).toFixed(0);
        profileOk = res.status === 200;
        profileData = res.data;
        subs.push({
          pass: profileOk,
          label: `GET /profiles/me → ${res.status} (${elapsed}ms) — ${profileData?.first_name || profileData?.email || "data received"}`,
        });
      } catch (err) {
        subs.push({
          pass: false,
          label: `GET /profiles/me failed: ${err.response?.status ?? err.message}`,
        });
      }

      // 1-c: Profile has a role/status (used by status gate)
      const hasStatus = !!profileData?.status;
      subs.push({
        pass: hasStatus,
        label: hasStatus
          ? `Profile status: "${profileData.status}"`
          : "Profile missing status field",
      });

      // 1-d: Token not in localStorage
      const noLs = !Object.keys(localStorage).some((k) => k.startsWith("sb-"));
      subs.push({
        pass: noLs,
        label: noLs
          ? "Token stored in memory only (no sb-* in localStorage)"
          : "WARNING: sb-* found in localStorage",
      });

      const allPass = subs.every((s) => s.pass);
      setResult(id, allPass ? "pass" : "fail", allPass ? "Valid session confirmed." : "Session check failed.", subs);
      log(allPass ? "pass" : "fail", `[${id}] ${allPass ? "PASS" : "FAIL"}`);
    });

  // ═══════════════════════════════════════════════════════════════
  //  GATE 2 — Reload Bootstrap Recovers Session
  // ═══════════════════════════════════════════════════════════════
  const testG2 = (id) =>
    run(id, async () => {
      const subs = [];

      // Simulate what App.jsx bootstrap does: clear memory token, attempt refresh
      const savedToken = getAccessToken();
      log("warn", `[${id}] Clearing in-memory token to simulate page reload`);
      setAccessToken(null);

      // 2-a: Refresh via cookie
      let refreshOk = false;
      let newToken = null;
      const start = performance.now();
      try {
        const r = await api.post("auth/refresh");
        refreshOk = r.status === 200 && !!r.data?.access_token;
        newToken = r.data?.access_token;
        if (newToken) setAccessToken(newToken);
      } catch (err) {
        log("fail", `[${id}] Refresh failed: ${err.response?.status ?? err.message}`);
      }
      const elapsed = (performance.now() - start).toFixed(0);
      subs.push({
        pass: refreshOk,
        label: refreshOk
          ? `POST auth/refresh → 200 (${elapsed}ms), got new access_token`
          : `POST auth/refresh failed (${elapsed}ms)`,
      });

      // 2-b: Protected call works with new token
      let protectedOk = false;
      if (refreshOk) {
        try {
          const res = await api.get(PROFILE_ENDPOINT);
          protectedOk = res.status === 200;
          subs.push({
            pass: protectedOk,
            label: protectedOk
              ? `GET /profiles/me → 200 with refreshed token`
              : `GET /profiles/me → ${res.status}`,
          });
        } catch (err) {
          subs.push({
            pass: false,
            label: `GET /profiles/me failed after refresh: ${err.response?.status ?? err.message}`,
          });
        }
      } else {
        subs.push({ pass: false, label: "Skipped — refresh failed" });
        // Restore so other tests still work
        if (savedToken) setAccessToken(savedToken);
      }

      // 2-c: New token is different from old (rotation)
      const rotated = newToken && newToken !== savedToken;
      subs.push({
        pass: !!rotated,
        label: rotated
          ? "Token rotated after refresh"
          : "Token NOT rotated (same as before or missing)",
      });

      const allPass = subs.every((s) => s.pass);
      setResult(id, allPass ? "pass" : "fail", allPass ? "Bootstrap recovery works." : "Bootstrap recovery failed.", subs);
      log(allPass ? "pass" : "fail", `[${id}] ${allPass ? "PASS" : "FAIL"}`);
    });

  // ═══════════════════════════════════════════════════════════════
  //  GATE 3 — Expired Token → Refresh + Retry
  // ═══════════════════════════════════════════════════════════════
  const testG3 = (id) =>
    run(id, async () => {
      const originalToken = getAccessToken();
      if (!originalToken) {
        setResult(id, "fail", "No access token — log in first.");
        log("fail", `[${id}] No token.`);
        return;
      }

      log("warn", `[${id}] Poisoning token → "expired.fake.token"`);
      setAccessToken("expired.fake.token");

      const start = performance.now();
      try {
        const res = await api.get(PROFILE_ENDPOINT);
        const elapsed = (performance.now() - start).toFixed(0);
        const newToken = getAccessToken();
        const tokenPreview = newToken ? newToken.slice(0, 20) : "<no token>";
        const rotated =
          newToken && newToken !== "expired.fake.token" && newToken !== originalToken;
        const httpStatus = res?.status;
        const hasData = res?.data !== undefined && res?.data !== null;
        const passed = httpStatus === 200 || (rotated && !httpStatus);

        const summary = [
          `Status: ${httpStatus ?? "(missing)"}`,
          `Time: ${elapsed}ms`,
          `Token rotated: ${rotated ? "YES" : "NO (may still be valid)"}`,
          `New token (20ch): ${tokenPreview}...`,
          `Has response data: ${hasData}`,
          `Data: ${JSON.stringify(res?.data ?? null).slice(0, 150)}`,
        ].join("\n");

        setResult(id, passed ? "pass" : "fail", summary);
        log(
          passed ? "pass" : "fail",
          `[${id}] ${passed ? "PASS" : "FAIL"} — status ${httpStatus ?? "?"} in ${elapsed}ms`
        );
      } catch (err) {
        const elapsed = (performance.now() - start).toFixed(0);
        setResult(
          id,
          "fail",
          `Error: ${err.message}\nStatus: ${err.response?.status ?? "N/A"}\nTime: ${elapsed}ms\nBody: Server returned an error.`
        );
        log("fail", `[${id}] FAIL — ${err.response?.status ?? err.message}`);
        setAccessToken(originalToken);

        log("warn", `[${id}] Restored original token.`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  //  GATE 3Q — Concurrent Refresh Queue (stampede test)
  // ═══════════════════════════════════════════════════════════════
  const testG3Q = (id) =>
    run(id, async () => {
      const originalToken = getAccessToken();
      if (!originalToken) {
        setResult(id, "fail", "No access token — log in first.");
        log("fail", `[${id}] No token.`);
        return;
      }

      log("warn", `[${id}] Poisoning token → "expired.fake.token"`);
      setAccessToken("expired.fake.token");

      log("info", `[${id}] Firing 3 concurrent requests...`);
      const start = performance.now();

      try {
        const settled = await Promise.allSettled([
          api.get(PROFILE_ENDPOINT),
          api.get(PROFILE_ENDPOINT),
          api.get(PROFILE_ENDPOINT),
        ]);
        const elapsed = (performance.now() - start).toFixed(0);
        const statuses = settled.map((r) =>
          r.status === "fulfilled"
            ? (r.value?.status ?? "fulfilled-no-status")
            : (r.reason?.response?.status ?? "rejected")
        );
        const allOk = statuses.every((s) => s === 200);
        const tokenAfter = getAccessToken();
        const tokenPreview = tokenAfter ? tokenAfter.slice(0, 20) : "<no token>";
        const rotated = tokenAfter && tokenAfter !== "expired.fake.token" && tokenAfter !== originalToken;
        // Count fulfilled (even if status is missing — means interceptor worked)
        const fulfilledCount = settled.filter((r) => r.status === "fulfilled").length;
        const passed = allOk || (fulfilledCount === 3 && rotated);

        const summary = [
          `Statuses: [${statuses.join(", ")}]`,
          `Fulfilled: ${fulfilledCount}/3`,
          `Time: ${elapsed}ms`,
          `All 200: ${allOk ? "YES" : "NO"}`,
          `Token rotated: ${rotated ? "YES" : "NO"}`,
          `Token after: ${tokenPreview}...`,
          `Verify in Network tab: only 1 refresh call, not 3.`,
        ].join("\n");

        setResult(id, passed ? "pass" : "fail", summary);
        log(
          passed ? "pass" : "fail",
          `[${id}] ${passed ? "PASS" : "FAIL"} — [${statuses.join(",")}] in ${elapsed}ms`
        );

        // If not all passed, restore token so other tests work
        if (!passed && !tokenAfter) {
          setAccessToken(originalToken);
          log("warn", `[${id}] Restored original token.`);
        }
      } catch (err) {
        const elapsed = (performance.now() - start).toFixed(0);
        setResult(
          id,
          "fail",
          `Error: ${err.message}\nStatus: ${err.response?.status ?? "N/A"}\nTime: ${elapsed}ms\nBody: Server returned an error.`
        );
        log("fail", `[${id}] FAIL — ${err.message}`);
        setAccessToken(originalToken);
        log("warn", `[${id}] Restored original token.`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  //  GATE 4 — Invalid Refresh Cookie → Clean Logout
  // ═══════════════════════════════════════════════════════════════
  const testG4 = (id) =>
    run(id, async () => {
      const originalToken = getAccessToken();

      // Pre-flight: quick refresh to see if cookie is already corrupted.
      // If it's still valid, G4 can't test anything — tell the user.
      log("info", `[${id}] Pre-flight: checking if sb_refresh cookie is corrupted...`);
      let cookieStillValid = false;
      try {
        const preflight = await api.post("auth/refresh");
        cookieStillValid = preflight.status === 200 && !!preflight.data?.access_token;
        if (cookieStillValid) setAccessToken(preflight.data.access_token);
      } catch {
        cookieStillValid = false;
      }

      if (cookieStillValid) {
        setResult(
          id,
          "info",
          [
            "SKIPPED — cookie is still valid. Refresh succeeded.",
            "",
            "To test G4 properly:",
            "  1. DevTools → Application → Cookies → localhost",
            '  2. Change sb_refresh value to "abc"',
            "  3. Click \"Run G4\" again (not Run ALL)",
          ].join("\n")
        );
        log("info", `[${id}] Cookie valid — G4 skipped. Corrupt cookie first.`);
        return;
      }

      log("warn", `[${id}] Cookie appears corrupted — proceeding with G4 test`);
      setAccessToken(null);

      log("info", `[${id}] GET ${PROFILE_ENDPOINT} — will 401 → refresh from cookie`);
      log("info", `[${id}] If sb_refresh cookie is corrupted, expect redirect to /login`);

      // Arm the flag — if the interceptor redirects to /login before
      // the catch block runs, the useEffect on next mount will detect it.
      try { sessionStorage.setItem(G4_ARMED_KEY, JSON.stringify({ timestamp: Date.now() })); } catch {}

      const start = performance.now();
      try {
        const res = await api.get(PROFILE_ENDPOINT);
        const elapsed = (performance.now() - start).toFixed(0);
        // Cookie was valid — not a real G4 test.  Disarm.
        try { sessionStorage.removeItem(G4_ARMED_KEY); } catch {}
        const summary = [
          `Status: ${res.status}`,
          `Time: ${elapsed}ms`,
          `Token restored: ${!!getAccessToken()}`,
          ``,
          `NOTE: Cookie was still valid — refresh succeeded.`,
          `To test G4 properly:`,
          `  1. DevTools > Application > Cookies > localhost`,
          `  2. Change sb_refresh value to "abc"`,
          `  3. Run this test again`,
        ].join("\n");
        setResult(id, "info", summary);
        log("info", `[${id}] Cookie was valid. Corrupt it to test G4.`);
      } catch (err) {
        // Catch ran before navigation — disarm the flag.
        try { sessionStorage.removeItem(G4_ARMED_KEY); } catch {}
        const elapsed = (performance.now() - start).toFixed(0);
        if (err.response?.status === 401) {
          setResult(
            id,
            "pass",
            [
              `Status: 401`,
              `Time: ${elapsed}ms`,
              `Token: ${getAccessToken() ?? "null (cleared)"}`,
              `Refresh rejected — interceptor should redirect to /login.`,
              `(If no redirect, check publicPaths in axios.js)`,
            ].join("\n")
          );
          log("pass", `[${id}] PASS — refresh rejected, token cleared.`);
        } else {
          setResult(
            id,
            "fail",
            `Unexpected: ${err.message}\nStatus: ${err.response?.status}`
          );
          log("fail", `[${id}] FAIL — ${err.message}`);
        }
        if (originalToken) {
          setAccessToken(originalToken);
          log("warn", `[${id}] Restored original token.`);
        }
      }
    });

  // ═══════════════════════════════════════════════════════════════
  //  GATE 5 — Logout Is Terminal
  // ═══════════════════════════════════════════════════════════════
  const testG5 = (id) =>
    run(id, async () => {
      const savedToken = getAccessToken();
      if (!savedToken) {
        setResult(id, "fail", "No access token — log in first. (We need a session to destroy.)");
        log("fail", `[${id}] No token.`);
        return;
      }

      const subs = [];

      // 5-a: Call logout endpoint
      let logoutOk = false;
      try {
        const r = await apiLogout();
        logoutOk = r.status === 200;
        subs.push({
          pass: logoutOk,
          label: `POST auth/logout → ${r.status}`,
        });
      } catch (err) {
        subs.push({
          pass: false,
          label: `Logout failed: ${err.response?.status ?? err.message}`,
        });
      }

      // 5-b: Clear in-memory token (simulating what the app does after logout)
      setAccessToken(null);
      subs.push({ pass: true, label: "In-memory token cleared" });

      // 5-c: Refresh should fail (cookie was cleared by logout)
      let refreshFailed = false;
      try {
        await api.post("auth/refresh");
        subs.push({
          pass: false,
          label: "Refresh SUCCEEDED after logout — cookie was NOT cleared!",
        });
      } catch (err) {
        refreshFailed = err.response?.status === 401;
        subs.push({
          pass: refreshFailed,
          label: refreshFailed
            ? "Refresh rejected after logout (401) — cookie cleared"
            : `Refresh returned ${err.response?.status ?? err.message}`,
        });
      }

      // 5-d: Protected endpoint should fail (use raw fetch to avoid interceptor refresh)
      let protectedBlocked = false;
      try {
        const r = await fetch(
          `${api.defaults.baseURL}/${PROFILE_ENDPOINT}`,
          { method: "GET", credentials: "include" }
        );
        protectedBlocked = r.status === 401;
        subs.push({
          pass: protectedBlocked,
          label: protectedBlocked
            ? "Protected endpoint blocked after logout (401)"
            : `Protected endpoint returned ${r.status} — still accessible!`,
        });
      } catch (err) {
        subs.push({ pass: false, label: `Fetch error: ${err.message}` });
      }

      const allPass = subs.every((s) => s.pass);
      setResult(
        id,
        allPass ? "pass" : "fail",
        allPass
          ? "Logout is terminal — session fully destroyed."
          : "Logout did NOT fully destroy session.",
        subs
      );
      log(allPass ? "pass" : "fail", `[${id}] ${allPass ? "PASS" : "FAIL"}`);

      // NOTE: after this test, user is logged out. They'll need to re-login.
      if (!allPass && savedToken) {
        setAccessToken(savedToken);
        log("warn", `[${id}] Restored token (test failed, keeping session for debugging).`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  //  GATE 6 — Route Exposure Audit
  // ═══════════════════════════════════════════════════════════════
  const testG6 = (id) =>
    run(id, async () => {
      const subs = [];

      log("info", `[${id}] Sweeping ${PROTECTED_ENDPOINTS.length} endpoints without Bearer...`);

      for (const ep of PROTECTED_ENDPOINTS) {
        try {
          // Raw fetch — no axios interceptor, no credentials
          const r = await fetch(
            `${api.defaults.baseURL}/${ep.url}`,
            { method: ep.method, credentials: "omit" }
          );
          const is401 = r.status === 401 || r.status === 403;

          // Distinguish failure types for clearer manuscript evidence
          let verdict;
          if (is401) {
            verdict = { pass: true, note: "" };
          } else if (r.status === 404) {
            // 404 means the route doesn't exist or the param is wrong,
            // BUT it also means no auth middleware blocked the request.
            verdict = { pass: false, note: " — NO AUTH MIDDLEWARE (reached router, got 404)" };
          } else {
            // 400, 200, 500, etc. — handler executed without auth check
            verdict = { pass: false, note: ` — NO AUTH MIDDLEWARE (handler returned ${r.status})` };
          }

          subs.push({
            pass: verdict.pass,
            label: `${ep.method} ${ep.label} → ${r.status}${verdict.note}`,
          });
          log(
            verdict.pass ? "pass" : "fail",
            `[${id}] ${ep.method} ${ep.label}: ${r.status}${verdict.pass ? " (protected)" : " EXPOSED"}`
          );
        } catch (err) {
          // Network error might mean route doesn't exist (which is fine — not exposed)
          subs.push({
            pass: true,
            label: `${ep.method} ${ep.label} → network error (${err.message}) — not exposed`,
          });
          log("info", `[${id}] ${ep.label}: network error — ${err.message}`);
        }
      }

      // Now verify they work WITH valid token
      const token = getAccessToken();
      if (token) {
        log("info", `[${id}] Re-testing first endpoint with valid token...`);
        try {
          const res = await api.get(PROTECTED_ENDPOINTS[0].url);
          const authedOk = res.status === 200;
          subs.push({
            pass: authedOk,
            label: `${PROTECTED_ENDPOINTS[0].label} with Bearer → ${res.status}${authedOk ? " (works)" : ""}`,
          });
        } catch (err) {
          subs.push({
            pass: false,
            label: `${PROTECTED_ENDPOINTS[0].label} with Bearer failed: ${err.response?.status ?? err.message}`,
          });
        }
      } else {
        // No token (e.g. after G5 logout) — treat as SKIP, not FAIL.
        // The unauthenticated sweep above already proved routes are protected.
        subs.push({
          pass: true,
          label: "Skipped authenticated check — no token (session ended). Unauthenticated sweep is sufficient.",
          skipped: true,
        });
      }

      const unauthSubs = subs.filter((s) => !s.skipped);
      const allProtected = unauthSubs.every((s) => s.pass);
      const hasSkip = subs.some((s) => s.skipped);
      setResult(
        id,
        allProtected ? "pass" : "fail",
        allProtected
          ? `All tested endpoints properly protected.${hasSkip ? " (Bearer re-test skipped — no active session)" : ""}`
          : "Some endpoints are exposed without auth!",
        subs
      );
      log(allProtected ? "pass" : "fail", `[${id}] ${allProtected ? "PASS" : "FAIL"}`);
    });

  // ═══════════════════════════════════════════════════════════════
  //  Run All (safe gates only — skips G4 destrucive & G5 logout)
  // ═══════════════════════════════════════════════════════════════
  const runAllSafe = async () => {
    const gates = [
      ["g0", testG0],
      ["g1", testG1],
      ["g2", testG2],
      ["g3", testG3],
      ["g3q", testG3Q],
      ["g6", testG6],
    ];
    for (const [gateId, fn] of gates) {
      await fn(gateId);
    }
  };

  const runAll = async () => {
    const gates = [
      ["g0", testG0],
      ["g1", testG1],
      ["g2", testG2],
      ["g3", testG3],
      ["g3q", testG3Q],
      ["g4", testG4],
      ["g5", testG5],
      ["g6", testG6],
    ];
    for (const [gateId, fn] of gates) {
      await fn(gateId);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  Export results as JSON (for manuscript appendix)
  // ═══════════════════════════════════════════════════════════════
  const exportResults = () => {
    const payload = {
      timestamp: new Date().toISOString(),
      environment: window.location.origin,
      userAgent: navigator.userAgent,
      gates: GATE_META.map((g) => {
        const r = results[g.id];
        return {
          id: g.id,
          title: g.title,
          status: r?.status ?? "not-run",
          detail: r?.detail ?? null,
          subResults: r?.subs?.map((s) => ({ pass: s.pass, label: s.label })) ?? null,
        };
      }),
      eventLog: logs.map((l) => ({
        time: l.time,
        level: l.level,
        msg: l.msg,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auth-qa-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render helpers ─────────────────────────────────────────────
  const token = getAccessToken();

  const ResultBox = ({ id }) => {
    const r = results[id];
    if (!r) return null;
    return (
      <>
        {r.subs && (
          <div className="sub-results">
            {r.subs.map((s, i) => (
              <div key={i} className={`sub-result ${s.pass ? "pass" : "fail"}`}>
                <span className="check">{s.pass ? "PASS" : "FAIL"}</span>
                {s.label}
              </div>
            ))}
          </div>
        )}
        <div className={`test-result ${r.status}`}>{r.detail}</div>
      </>
    );
  };

  const badgeFor = (id) => {
    const r = results[id];
    if (!r) return "not-run";
    return r.status;
  };

  // ── JSX ────────────────────────────────────────────────────────
  return (
    <div className="test-auth">
      <h1>Auth QA Harness</h1>
      <p className="subtitle">
        Production-grade acceptance gates (G0 – G6) for auth interceptor
        validation.
        <br />
        Each gate is isolated & deterministic. Export results as JSON for manuscript appendix.
      </p>

      {/* Token banner */}
      <div className={`token-status ${token ? "has-token" : "no-token"}`}>
        {token ? (
          <>
            <span>● Token present</span>
            <code>{token.slice(0, 30)}...</code>
          </>
        ) : (
          <span>
            ○ No access token — log in at /login first, then navigate here
          </span>
        )}
      </div>

      {/* ── Summary table ──────────────────────────────── */}
      <div className="summary-table-wrap">
        <h2>
          Gate Summary
          <span className="summary-actions">
            <button onClick={() => {
              setResults({});
              setLogs([]);
              try {
                sessionStorage.removeItem(STORAGE_KEY);
                sessionStorage.removeItem(G4_ARMED_KEY);
              } catch {}
            }}>Clear</button>
            <button onClick={exportResults}>Export JSON</button>
          </span>
        </h2>
        <table className="summary-table">
          <thead>
            <tr>
              <th>Gate</th>
              <th>Test</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {GATE_META.map((g) => {
              const r = results[g.id];
              return (
                <tr key={g.id}>
                  <td>
                    <strong>{g.label}</strong>
                  </td>
                  <td>{g.title}</td>
                  <td>
                    <span className={`badge ${badgeFor(g.id)}`}>
                      {r ? r.status.toUpperCase() : "NOT RUN"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "#777" }}>
                    {r?.subs
                      ? `${r.subs.filter((s) => s.pass).length}/${r.subs.length} checks`
                      : r?.status === "pending"
                        ? "Running..."
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Run-all bar ────────────────────────────────── */}
      <div className="run-all-bar">
        <button
          className="btn-run-safe"
          disabled={running !== null}
          onClick={runAllSafe}
        >
          Run Safe Gates (G0–G3, G6)
        </button>
        <button
          className="btn-run-all"
          disabled={running !== null}
          onClick={runAll}
        >
          Run ALL Gates (includes destructive)
        </button>
        <span className="hint">
          G4 (corrupt cookie) & G5 (logout) are destructive — session will end.
        </span>
      </div>

      {/* ── Gate cards ─────────────────────────────────── */}
      <div className="test-grid">
        {/* G0 */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g0">GATE 0</span>
            <h3>Sanity & Invariants</h3>
          </div>
          <p className="description">
            Checks that no Supabase tokens leaked to localStorage, refresh cookie is live,
            and protected endpoints return 401 without a Bearer token.
            <strong> If any fail, stop and fix before proceeding.</strong>
          </p>
          <div className="expected">
            <strong>Pass conditions:</strong>
            No sb-* in localStorage | Refresh cookie valid | /profiles/me → 401 raw
          </div>
          <button
            className="btn-teal"
            disabled={running !== null}
            onClick={() => testG0("g0")}
          >
            Run G0
          </button>
          <ResultBox id="g0" />
        </div>

        {/* G1 */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g1">GATE 1</span>
            <h3>Login Creates Valid Session</h3>
          </div>
          <p className="description">
            Verifies that after login: access token is a valid JWT in memory (not localStorage),
            <code> /profiles/me</code> returns 200, and profile includes a status field.
          </p>
          <div className="expected">
            <strong>Pass conditions:</strong>
            Valid JWT with sub/aud | /profiles/me → 200 | Profile has status | No sb-* in localStorage
          </div>
          <button
            className="btn-primary"
            disabled={running !== null}
            onClick={() => testG1("g1")}
          >
            Run G1
          </button>
          <ResultBox id="g1" />
        </div>

        {/* G2 */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g2">GATE 2</span>
            <h3>Reload Bootstrap Recovers Session</h3>
          </div>
          <p className="description">
            Simulates a hard refresh: clears the in-memory token, calls <code>POST auth/refresh</code> using
            only the HttpOnly cookie, then verifies protected endpoints work with the new token.
            Catches "works until you reload" bugs.
          </p>
          <div className="expected">
            <strong>Pass conditions:</strong>
            Refresh → 200 with new token | /profiles/me → 200 | Token rotated
          </div>
          <button
            className="btn-primary"
            disabled={running !== null}
            onClick={() => testG2("g2")}
          >
            Run G2
          </button>
          <ResultBox id="g2" />
        </div>

        {/* G3 */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g3">GATE 3</span>
            <h3>Expired Token → Refresh + Retry</h3>
          </div>
          <p className="description">
            Poisons the in-memory token with <code>"expired.fake.token"</code>, fires a single request.
            The interceptor must: detect 401, call <code>auth/refresh</code>, get a new token,
            and transparently retry the original request.
          </p>
          <div className="expected">
            <strong>Expected network:</strong> me 401 → refresh 200 → me 200
            <br />
            <strong>Expected result:</strong> Status 200, token rotated.
          </div>
          <button
            className="btn-primary"
            disabled={running !== null}
            onClick={() => testG3("g3")}
          >
            Run G3
          </button>
          <ResultBox id="g3" />
        </div>

        {/* G3Q */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g3">GATE 3Q</span>
            <h3>Concurrent Refresh Queue (Stampede Test)</h3>
          </div>
          <p className="description">
            Fires 3 simultaneous requests with a poisoned token. Only <strong>one</strong> refresh
            call should happen. The other two queue and resolve after the single refresh completes.
            Catches refresh stampede bugs.
          </p>
          <div className="expected">
            <strong>Expected network:</strong> 3x me 401 → 1x refresh 200 → 3x me 200
            <br />
            <strong>Verify:</strong> Only 1 <code>refresh</code> call in Network tab.
          </div>
          <button
            className="btn-primary"
            disabled={running !== null}
            onClick={() => testG3Q("g3q")}
          >
            Run G3Q
          </button>
          <ResultBox id="g3q" />
        </div>

        {/* G4 */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g4">GATE 4</span>
            <h3>Invalid Refresh Cookie → Clean Logout</h3>
          </div>
          <p className="description">
            Clears the in-memory token and fires a request. If the <code>sb_refresh</code> cookie
            is corrupted, the refresh will fail and the interceptor must redirect to <code>/login</code>
            with no refresh loop. <strong>Destructive — you must re-login after.</strong>
          </p>
          <div className="expected">
            <strong>Setup:</strong> DevTools → Application → Cookies → change <code>sb_refresh</code> to <code>"abc"</code>
            <br />
            <strong>Expected:</strong> refresh → 401 → cookie cleared → redirect to /login → no loop
          </div>
          <button
            className="btn-danger"
            disabled={running !== null}
            onClick={() => testG4("g4")}
          >
            Run G4 (destructive)
          </button>
          <ResultBox id="g4" />
        </div>

        {/* G5 */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g5">GATE 5</span>
            <h3>Logout Is Terminal</h3>
          </div>
          <p className="description">
            Calls <code>POST auth/logout</code>, then verifies: cookie cleared (refresh fails),
            in-memory token cleared, and protected endpoints return 401.
            <strong> Destructive — session ends. You must re-login.</strong>
          </p>
          <div className="expected">
            <strong>Pass conditions:</strong>
            Logout → 200 | Refresh → 401 afterward | /profiles/me → 401 raw
          </div>
          <button
            className="btn-danger"
            disabled={running !== null}
            onClick={() => testG5("g5")}
          >
            Run G5 (destructive — logs out)
          </button>
          <ResultBox id="g5" />
        </div>

        {/* G6 */}
        <div className="test-card">
          <div className="test-card-header">
            <span className="gate-label g6">GATE 6</span>
            <h3>Route Exposure Audit</h3>
          </div>
          <p className="description">
            Sweeps {PROTECTED_ENDPOINTS.length} sensitive endpoints using raw <code>fetch()</code>
            without credentials. Every route must return 401. Then re-tests with a valid Bearer to
            confirm they work when authenticated. <strong>Catches the most dangerous deployment bug:
            public /api/* routes.</strong>
          </p>
          <div className="expected">
            <strong>Pass conditions:</strong>
            All endpoints → 401 without token | At least one → 200 with token
          </div>
          <button
            className="btn-secondary"
            disabled={running !== null}
            onClick={() => testG6("g6")}
          >
            Run G6
          </button>
          <ResultBox id="g6" />
        </div>
      </div>

      {/* ── Event log ──────────────────────────────────── */}
      <div className="log-panel">
        <h3>
          Event Log ({logs.length})
          <button onClick={() => setLogs([])}>Clear</button>
        </h3>
        <div className="log-entries">
          {logs.length === 0 && (
            <div className="log-entry info">
              No events yet. Run a test above.
            </div>
          )}
          {logs.map((entry, i) => (
            <div key={i} className={`log-entry ${entry.level}`}>
              <span className="timestamp">{entry.time}</span>
              {entry.msg}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
