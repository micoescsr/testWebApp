// server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const FASTAPI_BASE = "http://mothership.tail781e52.ts.net:8000"; //ADDED 06:13 PM - 01/29/2026
//const FASTAPI_BASE = process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000"; //ADDED 06:10 PM - 01/29/2026

const webAppRoutes = require("./routes/webAppRoutes");
const rasPiRoutes = require("./routes/rasPiRoutes");
const captivePortalRoutes = require("./routes/captivePortalRoutes");
const scanRoutes = require('./routes/scanRoutes');
const authRoutes = require('./routes/authRoutes');

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
app.use("/api/webApp", webAppRoutes); 
app.use("/api/rasPi", rasPiRoutes); //dpt ilagay dito ung raspi scan and detect routes
app.use('/api/rasPi_scan', scanRoutes);
app.use('/api/auth', authRoutes);  // → /api/auth/sa/login



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
app.get("/api/detect/poll", async (req, res) => {
  const maxItems = Number(req.query.max_items ?? 50);

  try {
    const r = await fetch(
      `${FASTAPI_BASE}/detect/poll?max_items=${maxItems}`,
      {
        method: "GET",
        headers: { "Accept": "application/json" },
      }
    );

    const data = await r.json().catch(() => null);

    return res.status(r.status).json(
      data ?? { status: "ERROR", error: "Non-JSON response from FastAPI" }
    );

  } catch (err) {
    return res.status(502).json({
      status: "ERROR",
      error: "Failed to reach FastAPI /detect/poll",
      detail: String(err),
      fastapi_base: FASTAPI_BASE,
    });
  }
});




const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});