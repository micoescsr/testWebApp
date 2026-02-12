// server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const FASTAPI_BASE = "http://mothership.tail781e52.ts.net:8000"; //ADDED 06:13 PM - 01/29/2026
//const FASTAPI_BASE = process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000"; //ADDED 06:10 PM - 01/29/2026
const crypto = require("crypto"); // ADDED 03:22 PM - FEB 11

const webAppRoutes = require("./routes/webAppRoutes");
const rasPiRoutes = require("./routes/rasPiRoutes");
//const captivePortalRoutes = require("./routes/captivePortalRoutes");
const scanRoutes = require('./routes/scanRoutes');
const authRoutes = require('./routes/authRoutes');

const { authJWT } = require("./middleware/authMiddleware");
const { requireActiveProfile } = require("./middleware/statusMiddleware");
const { supabaseClient } = require("./config/supabaseClient");

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

// 1) Public auth routes (no JWT / status)
app.use("/api/auth", authRoutes); // /api/auth/login

// 2) Everything else under /api requires JWT + active profile
//app.use("/api", authJWT, requireActiveProfile);

// 3) Protected sub-routers
app.use("/api/webApp", webAppRoutes);
app.use("/api/rasPi", rasPiRoutes);
app.use("/api/rasPi_scan", scanRoutes);
//app.use("/api/captivePortal", captivePortalRoutes);

// Your create-user route
app.post('/admin/create-user', async (req, res) => {
  const { user } = await supabase.auth.getUser(req.headers.authorization);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.data.user.id).single();
  
  if (profile.role !== 'superadmin') {  // Fixed: profile.data → profile
    return res.status(403).json({ error: 'Only superadmins can create users' });
  }

  const { first_name, last_name, email, role, username, password } = req.body;
  
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name, last_name, role }
  });

  if (authError) return res.status(400).json({ error: authError.message });

  await supabase.from('profiles').update({ role, username }).eq('id', authUser.user.id);
  res.json({ message: 'User created', userId: authUser.user.id });
});



// ADDED 06:10 PM - 01/29/2026
/**
 * Proxy: GET /api/networks
 * Forwards request to FastAPI GET /networks
 */
app.get("/api/rasPi/networks_list_original", async (req, res) => {
  try {
    const r = await fetch(`${FASTAPI_BASE}/networks`, { //dpt aligned sa endpoint ni kerby which is naka /network lng
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    const data = await r.json();
    return res.status(r.status).json(data);

  } catch (err) {
    return res.status(502).json({
      status: "ERROR",
      error: "Failed to reach FastAPI /networks",
      detail: String(err),
      fastapi_base: FASTAPI_BASE,
    });
  }
});
// ADDED 06:10 PM - 01/29/2026

/**
 * Proxy: POST /api/scan
 * Forwards request to FastAPI POST /scan
 */
app.post("/api/scan_original", async (req, res) => {
  try {

  //uncomment if from react na galing
    /* const { ssid, bssid, channel } = req.body;
    console.log("req.body:", req.body);

    // Basic validation
    if (!ssid || !bssid || channel === undefined) {
      return res.status(400).json({
        dispatch_status: "ERROR",
        error: "Missing required fields",
        detail: "ssid, bssid, channel, and signal are required",
      });
    } */

    // Payload expected by dispatcher.py
    const payload = {
      signal: "enable",   // REQUIRED
      //hardcoded ko muna to test
      ssid: "Test_SSID_From_Server",
      bssid: "00:11:22:33:44:55",
      channel: 6,
      /* ssid,
      bssid,
      channel */
    };

    const r = await fetch(`${FASTAPI_BASE}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    return res.status(r.status).json(data);
    

  } catch (err) {
    return res.status(502).json({
      dispatch_status: "ERROR",
      error: "Failed to reach FastAPI /scan",
      detail: String(err),
      fastapi_base: FASTAPI_BASE,
    });
  }
});

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


app.get("/", (req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Networks Test</title></head>
<body>
  <h1>/networks test</h1>
  <button id="btn">Fetch networks</button>
  <pre id="out"></pre>

  <script>
    async function load() {
      const out = document.getElementById("out");
      out.textContent = "Loading...";
      try {
        const r = await fetch("/api/networks");
        const data = await r.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        out.textContent = "Error: " + e;
      }
    }
    document.getElementById("btn").addEventListener("click", load);
    // auto-load once:
    load();
  </script>
</body>
</html>
  `);
});


app.use('/api/rasPi_scan', scanRoutes);

/**
 * Proxy: GET /api/detect/poll
 * Forwards request to FastAPI GET /detect/poll
 * Optional query: ?max_items=50
 */
/* app.get("/api/detect/poll", async (req, res) => {
  const maxItems = Number(req.query.max_items ?? 50);

  try {
    const r = await fetch(
      `${FASTAPI_BASE}/detect/poll?max_items=${maxItems}`,
      {
        method: "GET",
        headers: { "Accept": "application/json" },
      }
    );

    // Try to parse the JSON from FastAPI
    const data = await r.json().catch(() => null);

    // If FastAPI returns successfully, pass it through
    if (r.ok && data) {

      //FOR POLLING DEBUGGING
      // --- DEBUG LOGGING START ---
      // Check if we actually have results in this poll cycle
      if (data.results && data.results.length > 0) {
        console.log("🔥 THREAT DETECTED [Express]:", JSON.stringify(data.results, null, 2));
      } else {
        // Optional: Log a 'dot' to show polling is alive without spamming text
        process.stdout.write("."); 
      }
      // --- DEBUG LOGGING END ---

      return res.status(200).json(data);
    }

    // If FastAPI returns an error code (4xx/5xx) or invalid JSON
    console.error("FastAPI Poll Error:", r.status, data);
    return res.status(200).json({
      running: false, // Tell frontend scanning isn't active
      results: [],
      last_error: `FastAPI error: ${r.status}`
    });

  } catch (err) {
    console.error("Poll Proxy Exception:", err.message);
    // Return a 'safe' structure so React doesn't crash on .map()
    return res.status(200).json({
      running: false,
      results: [],
      last_error: "Backend unavailable"
    });
  }
}); */

app.get("/api/detect/poll", async (req, res) => {
  const maxItems = Number(req.query.max_items ?? 50);

  try {
    /* const r = await fetch(`${FASTAPI_BASE}/detect/poll?max_items=${maxItems}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const data = await r.json().catch(() => null);

    if (r.ok && data) {
      // 🔹 USE the helper here
      const defsByCode = await loadThreatDefinitions(supabaseAdmin);
      const threatRows = await mapPollResultsToThreatRows(
        data.results || [],
        defsByCode
      );

      return res.status(200).json({
        ...data,
        threatRows,        // <-- now actually used
      });
    } */

      // 🔹 MOCKED data – replace with your real sample
  const fakeData = {
    running: true,
    target_bssid: "2c:55:d3:11:69:55",
    last_error: null,
    results: [
      {
        bssid: "2c:55:d3:11:69:55",
        status: "FOUND",
        findings: {
          evil_twin: {
            id: "WFVT-007",
            status: "DETECTED",
            value: "suspected evil twin",
            details: {
              first_seen_epoch: 1769869852.82147,
              last_seen_epoch: 1769869866.93297,
              duration_sec: 14.1,
            },
          },
        },
        detection_start: "2026-01-31 14:31:06.922",
        detection_end: "2026-01-31 14:31:06.933",
      },
      // add more fake results if you want multiple occurrences
    ],
  };

  // write to DB
  await persistThreatRows(fakeData.threatRows, fakeData.target_bssid);
  
    return res.status(200).json({
      /* running: false,
      results: [],
      threatRows: [],
      last_error: `FastAPI error: ${r.status}`, */
      fakeData,
    });
  } catch (err) {
    return res.status(200).json({
      running: false,
      results: [],
      threatRows: [],
      last_error: "Backend unavailable",
    });
  }
});

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

async function mapPollResultsToThreatRows(results, supabase) {
  if (!Array.isArray(results)) return [];

  const grouped = new Map();

  for (const r of results) {
    const evil = r?.findings?.evil_twin;
    if (!evil || evil.status !== "DETECTED") continue;

    const vtCode = evil.id; // "WFVT-007"

    // 1) Lookup metadata from vulnerability_threat_details by vt_code
    const { data: detail, error } = await supabase
      .from("vulnerability_threat_details")
      .select("vt_name, vt_cvss_base_score, vt_severity_rating, vt_kind")
      .eq("vt_code", vtCode)
      .maybeSingle();

    if (error || !detail) {
      console.warn("Missing vt details for code", vtCode, error);
      continue;
    }

    const vtName = detail.vt_name;                // dynamic name
    const score = detail.vt_cvss_base_score;      // dynamic CVSS
    const severity = detail.vt_severity_rating;   // e.g. "CRITICAL"
    const kind = detail.vt_kind;                  // "THREAT" / "VULNERABILITY"

    const firstSeen = evil.details?.first_seen_epoch;
    const lastSeen = evil.details?.last_seen_epoch;

    const key = vtCode;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: vtCode,
        vtCode,
        name: vtName,
        severity,   // from DB
        detectedTime: firstSeen
          ? new Date(firstSeen * 1000).toISOString()
          : r.detection_start,
        score,
        occurrences: 1,
        kind,
        raw: [r],
      });
    } else {
      const agg = grouped.get(key);
      agg.occurrences += 1;
      if (lastSeen) {
        agg.detectedTime = new Date(lastSeen * 1000).toISOString();
      }
      agg.raw.push(r);
    }
  }

  return Array.from(grouped.values());
}

async function loadThreatDefinitions(supabase) {
  const { data, error } = await supabase
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

  for (const r of results) {
    const evil = r?.findings?.evil_twin;
    if (!evil || evil.status !== "DETECTED") continue;

    const vtCode = evil.id;
    const detail = defsByCode.get(vtCode);
    if (!detail) continue;

    const key = vtCode;
    const firstSeen = evil.details?.first_seen_epoch;
    const lastSeen = evil.details?.last_seen_epoch;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: vtCode,
        vtCode,
        name: detail.vt_name,
        severity: detail.vt_severity_rating,
        detectedTime: firstSeen
          ? new Date(firstSeen * 1000).toISOString()
          : r.detection_start,
        score: detail.vt_cvss_base_score,
        occurrences: 1,
        kind: detail.vt_kind,
        raw: [r],
      });
    } else {
      const agg = grouped.get(key);
      agg.occurrences += 1;
      if (lastSeen) {
        agg.detectedTime = new Date(lastSeen * 1000).toISOString();
      }
      agg.raw.push(r);
    }
  }

  return Array.from(grouped.values());
}

// Example using supabase-js on the server

app.get('/api/history/vulnerabilities', async (req, res) => {
  try {
    // 1) Get all scans (you can add WHERE user_id = ... later)
    const { data: scans, error: scansError } = await supabaseClient
      .from('scans')
      .select('scan_id, created_at, scan_data')
      .order('created_at', { ascending: false });

    if (scansError) throw scansError;

    // 2) Get all findings for those scans where vt_kind = 'vulnerability'
    const scanIds = scans.map(s => s.scan_id);
    if (scanIds.length === 0) return res.json([]);

    const { data: findings, error: findingsError } = await supabaseClient
      .from('vulnerabilities_threat')
      .select('scan_id, vt_name, vt_kind, severity_score')
      .in('scan_id', scanIds);

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

      // Example: assume scan_data has ssid or network name
      const ssid =
        scan.scan_data?.ssid ||
        scan.scan_data?.network_name ||
        `Scan ${scan.scan_id}`;

      return {
        id: scan.scan_id,
        datetime: scan.created_at,          // you can format this client-side
        ssid,
        summary: items.length,              // number of vulns in this scan
        details: items.map(i => ({
          severity: 'UNKNOWN',              // or derive from vt_value / vt_status
          name: i.vt_name || i.vt_kind,
          score: i.severity_score ?? 0,
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
      .select('scan_id, created_at, scan_data')
      .order('created_at', { ascending: false });

    if (scansError) throw scansError;

    const scanIds = scans.map(s => s.scan_id);
    if (scanIds.length === 0) return res.json([]);

    const { data: findings, error: findingsError } = await supabaseClient
      .from('vulnerabilities_threat')
      .select('scan_id, vt_name, vt_kind, severity_score')
      .in('scan_id', scanIds);

    if (findingsError) throw findingsError;

    const byScan = new Map();
    for (const f of findings) {
      if (!byScan.has(f.scan_id)) byScan.set(f.scan_id, []);
      byScan.get(f.scan_id).push(f);
    }

    const result = scans.map(scan => {
      const items = byScan.get(scan.scan_id) || [];

      const ssid =
        scan.scan_data?.ssid ||
        scan.scan_data?.network_name ||
        `Scan ${scan.scan_id}`;

      return {
        id: scan.scan_id,
        datetime: scan.created_at,
        ssid,
        summary: items.length,
        threats: items.map(i => ({
          severity: 'UNKNOWN',
          name: i.vt_name || i.vt_kind,
          score: i.severity_score ?? 0,
          occurrences: 1,
          window: '', // fill if you have timing data
        })),
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch threat history' });
  }
});

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