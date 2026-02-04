/* //controllers/rasPiController.js
const rasPiService = require("../services/rasPiService");


async function insertMetadata(req, res) {
  try {
    const metadata = await rasPiService.insertMetadata(req.body);
    res.status(201).json(metadata);
  } catch (err) {
    res.status(500).json({ error: "Failed to insert metadata" });
  }
}

async function getAccessPointDetails(req, res) {
  try {
    const user = await rasPiService.getAccessPointDetails();
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to get access point details" });
  }
}

module.exports = {insertMetadata, getAccessPointDetails};

 */


// controllers/rasPiController.js
const rasPiService = require("../services/rasPiService");
const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://mothership.tail781e52.ts.net:8000";

/* async function triggerScan(req, res) {
  try {
    // Payload for FastAPI (your hardcoded works for testing)
    const payload = {
      //signal: "enable",
      ssid: req.body.ssid || "Test_SSID_From_Server",  // From React or hardcoded
      bssid: req.body.bssid || "00:11:22:33:44:55",
      channel: req.body.channel || 0,
    };

    // Call FastAPI (your exact logic)
    const r = await fetch(`${FASTAPI_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const fastapiData = await r.json();

    // 1. IMMEDIATE RESPONSE (display-first)
    res.status(r.status).json(fastapiData);

    // 2. ASYNC DB PERSIST (non-blocking)
    Promise.resolve().then(async () => {
      try {
        await rasPiService.insertScanResults(fastapiData);  // Your service!
      } catch (dbErr) {
        console.error("Background scan insert failed:", dbErr);
      }
    });

  } catch (err) {
    res.status(502).json({
      dispatch_status: "ERROR",
      error: "Failed to reach FastAPI /scan",
      detail: String(err),
      fastapi_base: FASTAPI_BASE,
    });
  }
} */
const { supabaseClient } = require("../config/supabaseClient");
  async function triggerScan(req, res) {
  try {
    const { ssid, bssid, channel } = req.body;

    // 1. IMMEDIATE FastAPI scan (uses bssid/channel)
    const payload = { ssid, bssid, channel };
    const r = await fetch(`${FASTAPI_BASE}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const fastapiData = await r.json();
    res.status(r.status).json(fastapiData);  // React gets instant results

    // 2. ASYNC: Insert scan metadata (non-blocking)
    Promise.resolve().then(async () => {
    try {
      // 1. Check for existing network
      let { data: network, error: lookupErr } = await supabaseClient  // or supabase
        .from('networks')
        .select('network_id')
        .eq('bssid', bssid)
        .maybeSingle();

      if (lookupErr) throw lookupErr;

      // 2. Create if missing
      if (!network) {
        const { data: newNet, error: insertErr } = await supabaseClient
          .from('networks')
          .insert({ ssid, bssid, channel })
          .select('network_id')
          .single();
        
        if (insertErr) throw insertErr;
        network = newNet;
      }

      // 3. NOW safe: Insert scan with network_id
      const { error: scanErr } = await supabaseClient
        .from('scans')
        .insert({
          network_id: network.network_id,  // Guaranteed to exist now
          scan_start: new Date().toISOString(),
          //dispatch_status: fastapiData.dispatch_status || 'OK'
        });

      if (scanErr) throw scanErr;

        console.log(`Scan saved: network_id=${network.network_id}`);
      } catch (dbErr) {
        console.error('Background scan insert failed:', dbErr);
      }
    });

  } catch (err) {
    res.status(502).json({ /* your error */ });
  }
}


/**
 * Proxy: GET /api/networks
 * Forwards request to FastAPI GET /networks
 */
async function getNetworksList(req, res) {
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
};

async function saveNetwork(req, res) {
  try {
    const { ssid, bssid, channel } = req.body;

    if (!ssid || !bssid || channel === undefined) {
      return res.status(400).json({ status: 'ERROR', error: 'Missing ssid/bssid/channel' });
    }

    const { data, error } = await supabase
      .from('networks')
      .insert({ ssid, bssid, channel })
      .select('network_id, *')  // Return new row
      .single();

    if (error) throw error;

    return res.status(201).json({
      status: 'OK',
      network: data  // Matches your FastAPI style [file:45]
    });
  } catch (err) {
    console.error('Save network error:', err);
    return res.status(500).json({
      status: 'ERROR',
      error: 'Failed to save network',
      detail: err.message
    });
  }
}// Export and mount: app.post('/api/networks', saveNetwork);


async function insertMetadata(req, res) {
  try {
    const metadata = await rasPiService.insertMetadata(req.body);  // now orchestrates everything
    res.status(201).json(metadata);
  /* } catch (err) {
    res.status(500).json({ error: "Failed to insert metadata" });
  } */
    } catch (err) { //better error logging
    console.error("insertMetadata ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}

async function getAccessPointDetails(req, res) {
  try {
    const networks = await rasPiService.getAccessPointDetails();
    res.status(200).json(networks);  // 200 for GET
  } catch (err) {
    res.status(500).json({ error: "Failed to get access point details" });
  }
}

module.exports = { triggerScan, getNetworksList, saveNetwork,insertMetadata, getAccessPointDetails };
