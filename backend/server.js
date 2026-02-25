// server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const FASTAPI_BASE = "http://mothership-1.tail781e52.ts.net:8000"; //ADDED 06:13 PM - 01/29/2026
//const FASTAPI_BASE = process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000"; //ADDED 06:10 PM - 01/29/2026
const crypto = require("crypto"); // ADDED 03:22 PM - FEB 11

const webAppRoutes = require("./routes/webAppRoutes");
const rasPiRoutes = require("./routes/rasPiRoutes");
const samRoutes = require("./routes/samRoutes");
//const captivePortalRoutes = require("./routes/captivePortalRoutes");
const scanRoutes = require('./routes/scanRoutes');
const deviceMgmtRoutes = require('./routes/deviceMgmtRoutes');
const authRoutes = require('./routes/authRoutes');

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
  })
);

app.use(express.json());
app.use("/api/webapp", webAppRoutes); 
app.use("/api/rasPi", rasPiRoutes); //dpt ilagay dito ung raspi scan and detect routes
app.use('/api/rasPi_scan', scanRoutes);
app.use('/api/device', deviceMgmtRoutes);
app.use('/api/sam', samRoutes);

// 1) Public auth routes (no JWT / status)
app.use("/api/auth", authRoutes); // /api/auth/login

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

app.get("/api/detect/poll", async (req, res) => {
  const maxItems = Number(req.query.max_items ?? 50);

  try {
    const r = await fetch(
      `${FASTAPI_BASE}/detect/poll?max_items=${maxItems}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      }
    );

    const data = await r.json().catch(() => null);

    if (r.ok && data) {
      if (data.results && data.results.length > 0) {
        console.log(
          "🔥 THREAT DETECTED [Express]:",
          JSON.stringify(data.results, null, 2)
        );
      } else {
        process.stdout.write(".");
      }

      const defsByCode = await loadThreatDefinitions(supabaseClient);
      const threatRows = mapPollResultsToThreatRows(
        data.results || [],
        defsByCode
      );

      console.log(
        "Mapped threatRows:",
        JSON.stringify(threatRows, null, 2)
      );

      // ✅ get BSSID from first result and normalize
      const firstResult = (data.results || [])[0] || null;
      const targetBssid = firstResult?.bssid
        ? firstResult.bssid.toUpperCase()
        : null;

      console.log("Using targetBssid for persistence:", targetBssid);


      // optional save:
      //await persistThreatRows(threatRows, data.target_bssid, supabaseClient);
      await persistThreatRows(threatRows, targetBssid, supabaseClient); //tangina kung ito may salarin papatayin ko to
      

      return res.status(200).json({
        ...data,
        threatRows,
      });
    }

    return res.status(200).json({
      running: false,
      results: [],
      threatRows: [],
      last_error: `FastAPI error: ${r.status}`,
    });
  } catch (err) {
    console.error("Poll Proxy Exception:", err.message);
    return res.status(200).json({
      running: false,
      results: [],
      threatRows: [],
      last_error: "Backend unavailable",
    });
  }
});


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
}


//========================================

app.get('/api/history/vulnerabilities', async (req, res) => {
  try {
    // 1) Get all scans joined with networks for SSID/BSSID/channel/num_clients
    const { data: scans, error: scansError } = await supabaseClient
      .from('scans')
      .select(`
        scan_id,
        created_at,
        scan_start,
        scan_end,
        scan_data,
        risk_score,
        networks (
          ssid,
          bssid,
          channel,
          num_clients
        )
      `)
      .order('created_at', { ascending: false });

    if (scansError) throw scansError;

    // 2) Get all findings for those scans where vt_kind = 'vulnerability'
    const scanIds = scans.map(s => s.scan_id);
    if (scanIds.length === 0) return res.json([]);

    const { data: findings, error: findingsError } = await supabaseClient
      .from('vulnerabilities_threat')
      .select(`
        scan_id,
        vt_name,
        vt_kind,
        vt_status,
        vt_value,
        severity_score,
        detail:vulnerability_threat_details (
          vt_code,
          vt_name,
          vt_severity_rating,
          vt_cvss_base_score
        )
      `)
      .in('scan_id', scanIds)
      .eq('vt_kind', 'vulnerability');

    if (findingsError) throw findingsError;

    // 3) Group findings by scan_id
    const byScan = new Map();
    for (const f of findings) {
      if (!byScan.has(f.scan_id)) byScan.set(f.scan_id, []);
      byScan.get(f.scan_id).push(f);
    }

    // 4) Map to frontend shape
    const result = scans.map(scan => {
      const items = byScan.get(scan.scan_id) || [];
      const net = scan.networks || {};

      const ssid =
        net.ssid ||
        scan.scan_data?.ssid ||
        scan.scan_data?.network_name ||
        `Scan ${scan.scan_id}`;

      return {
        id: scan.scan_id,
        datetime: scan.created_at,
        ssid,
        bssid: net.bssid || scan.scan_data?.bssid || null,
        channel: net.channel ?? scan.scan_data?.channel ?? null,
        scan_start: scan.scan_start || scan.scan_data?.scan_start || null,
        scan_end: scan.scan_end || scan.scan_data?.scan_end || null,
        num_clients: net.num_clients ?? scan.scan_data?.num_clients ?? null,
        riskScore: scan.risk_score ?? 0,
        riskLabel: getRiskLabel(scan.risk_score ?? 0),
        summary: items.length,
        details: items.map(i => ({
          id: i.detail?.vt_code ?? null,
          severity: i.detail?.vt_severity_rating ?? 'UNKNOWN',
          name: i.detail?.vt_name || i.vt_name || i.vt_kind,
          score: i.detail?.vt_cvss_base_score ?? i.severity_score ?? 0,
          status: i.vt_status || null,
          value: i.vt_value || null,
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vulnerability history' });
  }
});

app.get('/api/history/threats', async (req, res) => {
  try {
    const { data: scans, error: scansError } = await supabaseClient
      .from('scans')
      .select(`
        scan_id,
        created_at,
        scan_start,
        scan_end,
        scan_data,
        risk_score,
        networks (
          ssid,
          bssid,
          channel,
          num_clients
        )
      `)
      .order('created_at', { ascending: false });

    if (scansError) throw scansError;

    const scanIds = scans.map(s => s.scan_id);
    if (scanIds.length === 0) return res.json([]);

    const { data: findings, error: findingsError } = await supabaseClient
      .from("vulnerabilities_threat")
      .select(`
        scan_id,
        vt_name,
        vt_kind,
        vt_status,
        severity_score,
        detail:vulnerability_threat_details(
          vt_code,
          vt_severity_rating,
          vt_cvss_base_score
        )
      `)
      .in("scan_id", scanIds)
      .eq("vt_kind", "threat");

    if (findingsError) throw findingsError;

    const byScan = new Map();
    for (const f of findings) {
      if (!byScan.has(f.scan_id)) byScan.set(f.scan_id, []);
      byScan.get(f.scan_id).push(f);
    }

    const result = scans.map(scan => {
      const items = byScan.get(scan.scan_id) || [];
      const net = scan.networks || {};

      const ssid =
        net.ssid ||
        scan.scan_data?.ssid ||
        scan.scan_data?.network_name ||
        `Scan ${scan.scan_id}`;

      return {
        id: scan.scan_id,
        datetime: scan.created_at,
        ssid,
        bssid: net.bssid || scan.scan_data?.bssid || null,
        channel: net.channel ?? scan.scan_data?.channel ?? null,
        scan_start: scan.scan_start || scan.scan_data?.scan_start || null,
        scan_end: scan.scan_end || scan.scan_data?.scan_end || null,
        num_clients: net.num_clients ?? scan.scan_data?.num_clients ?? null,
        riskScore: scan.risk_score ?? 0,
        riskLabel: getRiskLabel(scan.risk_score ?? 0),
        summary: items.length,
        threats: items.map(i => ({
          code: i.detail?.vt_code ?? null,
          severity: i.detail?.vt_severity_rating ?? 'UNKNOWN',
          name: i.vt_name || i.vt_kind,
          score: i.detail?.vt_cvss_base_score ?? i.severity_score ?? 0,
          status: i.vt_status || null,
          occurrences: 1,
          window: '',
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch threat history' });
  }
});


// Replace your server.js announcement/terms routes - DYNAMIC network_id support

//======================================

// Get current announcement (latest active for SPECIFIC network)
app.get("/api/announcement", async (req, res) => {
  try {
    const { network_id } = req.query;  // 👈 NEW: from ?network_id=uuid
    
    if (!network_id) {
      return res.status(400).json({ error: "network_id query param required" });
    }

    const { data, error } = await supabaseClient
      .from("captive_portal_announcements")
      .select("*")
      .eq("network_id", network_id)      // 👈 DYNAMIC: use query param
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    res.json(
      data || {
        announcement_id: null,
        announcement_content: "",
        created_at: null,
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch announcement" });
  }
});

// Get announcement history for SPECIFIC network
app.get("/api/announcement/history", async (req, res) => {
  try {
    const { network_id } = req.query;  // 👈 NEW
    
    if (!network_id) {
      return res.status(400).json({ error: "network_id query param required" });
    }

    const { data, error } = await supabaseClient
      .from("captive_portal_announcements")
      .select("*")
      .eq("network_id", network_id)      // 👈 DYNAMIC
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch announcement history" });
  }
});

// Publish new announcement (for SPECIFIC network)
app.post("/api/announcement", async (req, res) => {
  try {
    const { content, network_id } = req.body;  // 👈 NEW: network_id from body

    if (!network_id) {
      return res.status(400).json({ error: "network_id required in body" });
    }

    // Deactivate previous announcements for this network
    await supabaseClient
      .from("captive_portal_announcements")
      .update({ is_active: false })
      .eq("network_id", network_id);

    const { data, error } = await supabaseClient
      .from("captive_portal_announcements")
      .insert({
        announcement_content: content ?? "",
        is_active: true,
        network_id: network_id,            // 👈 DYNAMIC - no more NETWORK_ID
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to publish announcement" });
  }
});

// 👈 FIXED: Terms now also per-network (matches your FK schema)
app.get("/api/terms", async (req, res) => {
  try {
    const { network_id } = req.query;  // 👈 NEW
    
    if (!network_id) {
      return res.status(400).json({ error: "network_id query param required" });
    }

    const { data, error } = await supabaseClient
      .from("terms_conditions")
      .select("*")
      .eq("network_id", network_id)      // 👈 Assuming you add this column
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    res.json(
      data || {
        tc_id: null,
        content: "",
        version: "",
        created_at: null,
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch terms" });
  }
});

app.get("/api/terms/history", async (req, res) => {
  try {
    const { network_id } = req.query;
    
    if (!network_id) {
      return res.status(400).json({ error: "network_id query param required" });
    }

    const { data, error } = await supabaseClient
      .from("terms_conditions")
      .select("*")
      .eq("network_id", network_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch terms history" });
  }
});

app.post("/api/terms", async (req, res) => {
  try {
    const { content, version, network_id } = req.body;  // 👈 NEW
    
    if (!network_id) {
      return res.status(400).json({ error: "network_id required in body" });
    }

    // Deactivate previous terms for this network
    await supabaseClient
      .from("terms_conditions")
      .update({ is_active: false })
      .eq("network_id", network_id);

    const { data, error } = await supabaseClient
      .from("terms_conditions")
      .insert({
        content: content ?? "",
        version: version ?? "v1",
        is_active: true,
        network_id: network_id,            // 👈 DYNAMIC
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to publish terms" });
  }
});

// NOTE: /enable-ap moved to routes/deviceMgmtRoutes.js

// The networks-by-id GET was moved into the rasPi router (rasPiRoutes)
// so that all rasPi-related endpoints live under /api/rasPi.



// ADDED 03:23 PM - FEB 11
async function getCurrentUserRole(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data.role;
}
// ADDED 03:23 PM - FEB 11 --- END

// ADDED 03:23 PM - FEB 11
// POST /api/webApp/users/profiles/:id/activate-with-temp
// Superadmin only: sets profile active, generates temp password, updates auth.users, returns temp once.
app.post(
  "/api/webApp/users/profiles/:id/activate-with-temp",
  authJWT,
  async (req, res) => {
    try {
      const currentUser = req.user;
      if (!currentUser || !currentUser.id) {
        return res.status(401).json({ error: "No authenticated user" });
      }

      const currentRole = await getCurrentUserRole(currentUser.id);
      if (currentRole !== "superadmin") {
        return res.status(403).json({ error: "Superadmin only" });
      }

      const id = req.params.id;
      const { first_name, last_name, username, email, role } = req.body;

console.log("activate-with-temp payload:", {
  id,
  first_name,
  last_name,
  username,
  email,
  role,
});

      // 1) Update profiles
      const { data: updatedProfile, error: profileError } =
        await supabaseClient
          .from("profiles")
          .update({
            first_name,
            last_name,
            username,
            email,
            role,
            status: "active",
            must_change_password: true,
            temp_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          })
          .eq("id", id)
          .select()
          .single();

      if (profileError) {
        console.error("activate-with-temp profileError:", profileError);
        return res.status(400).json({ error: profileError.message });
      }

      // 2) Generate secure random temp password
      const tempPassword = crypto.randomBytes(32).toString("base64url");

      // 3) Update auth user
      const { error: authError } =
        await supabaseClient.auth.admin.updateUserById(id, {
          email,
          password: tempPassword,
        });

      if (authError) {
        console.error("activate-with-temp authError:", authError);
        return res.status(400).json({ error: authError.message });
      }

      // 4) Success
      return res.json({
        profile: updatedProfile,
        tempPassword,
      });
    } catch (err) {
      console.error("activate-with-temp error:", err);
      return res
        .status(500)
        .json({ error: "Failed to activate user with temp" });
    }
  }
);
// ADDED 03:23 PM - FEB 11 --- END





const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});