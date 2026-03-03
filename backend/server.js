// server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const FASTAPI_BASE = "http://mothership-1.tail781e52.ts.net:8000"; //ADDED 06:13 PM - 01/29/2026
//const FASTAPI_BASE = process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000"; //ADDED 06:10 PM - 01/29/2026
const crypto = require("crypto"); // ADDED 03:22 PM - FEB 11

const webAppRoutes = require("./routes/webAppRoutes");
const rasPiRoutes = require("./routes/rasPiRoutes");
const samRoutes = require("./routes/samRoutes");
const captivePortalRoutes = require("./routes/captivePortalRoutes");
//const scanRoutes = require('./routes/scanRoutes');
const deviceMgmtRoutes = require('./routes/deviceMgmtRoutes');
const authRoutes = require('./routes/authRoutes');
const auditRoutes = require('./routes/auditRoutes');
const detectRoutes = require('./routes/detectRoutes');
const historyRoutes = require('./routes/historyRoutes');
const detectStateService = require('./services/detectStateService');
const { requestIdMiddleware } = require('./middleware/requestIdMiddleware');

const { authJWT } = require("./middleware/authMiddleware");
const { requireActiveProfile } = require("./middleware/statusMiddleware");
const { supabaseClient } = require("./config/supabaseClient");

// Risk-score label (0–100 scale) — mirrors rasPiController.getRiskLabel
function getRiskLabel(score) {
  const s = Number(score) || 0;
  if (s === 0) return "NONE";
  if (s <= 39) return "LOW";
  if (s <= 69) return "MEDIUM";
  if (s <= 89) return "HIGH";
  return "CRITICAL";
}

const app = express();
const allowedOrigins = ["http://localhost:5173"]; // Vite dev server

app.use(cookieParser());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());
app.use(requestIdMiddleware);
app.use("/api/webapp", webAppRoutes); 
app.use("/api/rasPi", rasPiRoutes); //dpt ilagay dito ung raspi scan and detect routes
//app.use('/api/rasPi_scan', scanRoutes);
app.use('/api/device', deviceMgmtRoutes);
app.use('/api/sam', samRoutes);
app.use('/api/captivePortal', captivePortalRoutes);

// 1) Public auth routes (no JWT / status)
app.use("/api/auth", authRoutes); // /api/auth/login

// 2) Audit routes (superadmin only, JWT + role enforced per-route)
app.use("/api/audit", auditRoutes);

// 3) Detection lifecycle + poll (JWT-protected per-route)
app.use("/api/detect", detectRoutes);

// 4) History (JWT-protected, user-scoped per controller logic)
app.use("/api/history", historyRoutes);

// 2) Everything else under /api requires JWT + active profile
//app.use("/api", authJWT, requireActiveProfile);

// 3) Protected sub-routers
//app.use("/api/webApp", webAppRoutes);
//app.use("/api/rasPi", rasPiRoutes);
//app.use("/api/rasPi_scan", scanRoutes);
//app.use("/api/captivePortal", captivePortalRoutes);

app.get("/api/device/status", async (req, res) => {
  try {
    const r = await fetch(`${FASTAPI_BASE}/device/status`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    const data = await r.json().catch(() => null);

    // Forward FastAPI status code and JSON
    return res.status(r.status).json(
      data ?? { status: "ERROR", error: "Non-JSON response from FastAPI" }
    );

  } catch (err) {
    return res.status(502).json({
      status: "ERROR",
      error: "Failed to reach FastAPI /device/status",
      detail: String(err),
      fastapi_base: FASTAPI_BASE,
    });
  }
});

// Old /api/detect/poll handler removed — now in controllers/detectController.js via detectRoutes


async function loadThreatDefinitions(supabaseClient) {
  const { data, error } = await supabaseClient
    .from("vulnerability_threat_details")
    .select("vt_code, vt_name, vt_cvss_base_score, vt_severity_rating, vt_kind");

  if (error) throw error;
  const map = new Map();
  for (const d of data) {
    map.set(d.vt_code, d);
  }
  return map;
}

function mapPollResultsToThreatRows(results, defsByCode) {
  const grouped = new Map();
  const findingKeys = ["evil_twin", "mac_spoofing", "deauthentication"]; // add more types here

  for (const r of results || []) {
    for (const key of findingKeys) {
      const f = r?.findings?.[key];
      if (!f) continue;                     // allow DETECTED or CLEARED

      const vtCode = f.id;           // e.g. WFVT-006, WFVT-007
      const detail = defsByCode.get(vtCode);
      if (!detail) continue;

      const firstSeen = f.details?.first_seen_epoch;
      const lastSeen  = f.details?.last_seen_epoch;
      const mapKey = vtCode;         // or `${vtCode}:${key}` if you want them separate

      if (!grouped.has(mapKey)) {
        grouped.set(mapKey, {
          id: vtCode,
          name: detail.vt_name,
          severity: detail.vt_severity_rating,
          score: detail.vt_cvss_base_score,
          status: f.status,         //DETECTED or CLEARED
          occurrences: 1,
          detectedTime: firstSeen
            ? new Date(firstSeen * 1000).toISOString()
            : r.detection_cycle_start,
          // sessions array for expanded rows
          sessions: [{
            firstSeen,
            lastSeen,
            state: f.status,         // DETECTED or CLEARED
          }],
          raw: [r],
        });
      } else {
        const agg = grouped.get(mapKey);
        agg.occurrences += 1;
        agg.status = f.status; //latest state (CLEARED should override)
        if (lastSeen) {
          agg.detectedTime = new Date(lastSeen * 1000).toISOString();
        }
       agg.sessions.push({
          firstSeen,
          lastSeen,
          state: f.status,
        });
        agg.raw.push(r);
      }
    }
  }

  return Array.from(grouped.values());
}


async function findLatestScanIdForBssid(targetBssid, supabaseClient) {
  if (!targetBssid) return null;

  console.log("findLatestScanIdForBssid: targetBssid =", targetBssid);

  const { data: networks, error: netErr } = await supabaseClient
    .from("networks")
    .select("network_id, bssid, created_at")
    .eq("bssid", targetBssid)
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Networks for BSSID:", networks, "error:", netErr);

  if (netErr || !networks || networks.length === 0) {
    console.warn("No network found for BSSID", targetBssid, netErr);
    return null;
  }

  const networkId = networks[0].network_id;
  console.log("Using networkId:", networkId);

  const { data: scans, error: scansErr } = await supabaseClient
    .from("scans")
    .select("scan_id, network_id, created_at")
    .eq("network_id", networkId)
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Scans for network:", scans, "error:", scansErr);

  if (scansErr || !scans || scans.length === 0) {
    console.warn("No scans found for network", networkId, scansErr);
    return null;
  }

  return scans[0].scan_id;
}

async function persistThreatRows(threatRows, targetBssid, supabaseClient) {

  console.log("persistThreatRows called with", {
    targetBssid,
    count: Array.isArray(threatRows) ? threatRows.length : "not array",
  });
  if (!Array.isArray(threatRows) || threatRows.length === 0) return;

  // Normalize BSSID to match networks.bssid format (your table uses uppercase with colons)
  const normalizedBssid = targetBssid ? targetBssid.toUpperCase() : null;

  const scanId = await findLatestScanIdForBssid(normalizedBssid, supabaseClient);
  if (!scanId) {
    console.warn("No scan_id found, skipping threat persistence");
    return;
  }

  for (const t of threatRows) {
    // lookup detail again to get vt_detail_id, vt_kind, score
    const { data: detail, error: detailErr } = await supabaseClient
      .from("vulnerability_threat_details")
      .select("vt_detail_id, vt_kind, vt_cvss_base_score")
      .eq("vt_code", t.id)
      .maybeSingle();

    if (detailErr || !detail) {
      console.error("Missing vt_detail for code", t.id, detailErr);
      continue;
    }

    // latest session state determines vt_status
    const sessions = t.sessions || t.raw || [];
    const lastSession = sessions[sessions.length - 1] || null;
    const vtStatus =
      lastSession?.state === "DETECTED" ? "DETECTED" : "CLEARED";

    const payload = {
      scan_id: scanId,
      vt_name: t.name,
      vt_status: vtStatus,
      vt_value: t.name, // adjust later if you want a specific value
      vt_detail_id: detail.vt_detail_id,
      vt_kind: detail.vt_kind,
      severity_score: detail.vt_cvss_base_score,
    };

    const { error: insertErr } = await supabaseClient
      .from("vulnerabilities_threat")
      .insert(payload);

    if (insertErr) {
      console.error("Error inserting threat row", insertErr, payload);
    }
  }

  // After all threat rows are persisted, compute + store risk score on the scan
  const { computeRiskScore } = require("./utils/scoring");
  const findings = threatRows.map(t => ({ score: t.score ?? 0 }));
  const riskScore = computeRiskScore(findings);

  const { error: scoreErr } = await supabaseClient
    .from("scans")
    .update({ risk_score: riskScore })
    .eq("scan_id", scanId);

  if (scoreErr) {
    console.error("Failed to update scan risk_score", scoreErr);
  } else {
    console.log(`Scan ${scanId} risk_score updated to ${riskScore}`);
  }

  // ── Risk pipeline: update networks.risk_bucket + auto-portal ──
  // Resolve network_id from BSSID so the risk pipeline can update the right network
  if (normalizedBssid) {
    const { data: netRow } = await supabaseClient
      .from('networks')
      .select('network_id')
      .eq('bssid', normalizedBssid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (netRow?.network_id) {
      try {
        const { onThreatEvent } = require('./utils/riskPipeline');
        await onThreatEvent(netRow.network_id, threatRows);
      } catch (pipeErr) {
        console.error('[riskPipeline] onThreatEvent error (non-fatal):', pipeErr.message);
      }
    }
  }
}


//========================================
// History endpoints moved to controllers/historyController.js + routes/historyRoutes.js
// Mounted at: app.use("/api/history", historyRoutes)
// Endpoints:
//   GET /api/history/vulnerabilities  (JWT required, user-scoped)
//   GET /api/history/threats          (JWT required, user-scoped)
//========================================


// ─── Announcement / Terms / Tips / Risk / Portal Sync ────────────
// Moved to controllers/captivePortalController.js + routes/captivePortalRoutes.js
// Mounted at: app.use('/api/captivePortal', captivePortalRoutes)
// Endpoints:
//   GET  /api/captivePortal/announcement?network_id=
//   GET  /api/captivePortal/announcement/history?network_id=
//   POST /api/captivePortal/announcement            { content, network_id }
//   GET  /api/captivePortal/terms?network_id=
//   GET  /api/captivePortal/terms/history?network_id=
//   POST /api/captivePortal/terms                   { content, version, network_id }
//   GET  /api/captivePortal/tips?network_id=
//   POST /api/captivePortal/tips                    { network_id, tips: [...] }
//   GET  /api/captivePortal/risk-classifications
//   GET  /api/captivePortal/summary?network_id=&score=
//   POST /api/captivePortal/sync                    { network_id, score? }

// NOTE: /enable-ap moved to routes/deviceMgmtRoutes.js

// The networks-by-id GET was moved into the rasPi router (rasPiRoutes)
// so that all rasPi-related endpoints live under /api/rasPi.



// COMMENTED OUT (moved to controllers/userController.js + routes/userRoutes.js for alignment)
// async function getCurrentUserRole(userId) {
//   const { data, error } = await supabaseClient
//     .from("profiles")
//     .select("role")
//     .eq("id", userId)
//     .single();
//
//   if (error) throw error;
//   return data.role;
// }

// app.post(
//   "/api/webApp/users/profiles/:id/activate-with-temp",
//   authJWT,
//   async (req, res) => { /* now handled in userRoutes/userController */ }
// );


const PORT = process.env.PORT || 3000;
const { execSync } = require('child_process');

function killPort(port) {
  try {
    const out = execSync(
      `netstat -ano | findstr :${port} | findstr LISTENING`,
      { encoding: 'utf8' }
    );
    const pids = [...new Set(
      out.trim().split('\n')
        .map(l => l.trim().split(/\s+/).pop())
        .filter(p => p && p !== '0')
    )];
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`Killed stale process PID ${pid} on port ${port}`);
      } catch (_) { /* already dead */ }
    }
    return pids.length > 0;
  } catch (_) {
    return false; // nothing listening
  }
}

let retried = false;

function startServer() {
  const server = app.listen(PORT, async () => {
    console.log(`API running on http://localhost:${PORT}`);
    // Ensure detection_state row exists on startup
    try {
      await detectStateService.ensureRow();
      console.log("[startup] detection_state row ensured");

      // Start server-side heartbeat loop — pings FastAPI independently
      // of any browser tab, so detection doesn't FAIL when users are idle.
      detectStateService.startServerHeartbeatLoop();
    } catch (err) {
      console.error("[startup] Failed to ensure detection_state row:", err.message);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !retried) {
      retried = true;
      console.log(`⚠️  Port ${PORT} in use — auto-killing stale process...`);
      if (killPort(PORT)) {
        setTimeout(() => startServer(), 1000);
      } else {
        console.error(`❌ Port ${PORT} is in use but could not identify the process. Kill it manually.`);
        process.exit(1);
      }
    } else if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} still in use after retry. Kill it manually.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
}

startServer();

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});