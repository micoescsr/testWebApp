// controllers/rasPiController.js
const rasPiService = require("../services/rasPiService");
const FASTAPI_BASE = process.env.FASTAPI_BASE || "http://mothership.tail781e52.ts.net:8000";

const { supabaseClient } = require("../config/supabaseClient");
  async function triggerScan(req, res) {
  try {
    const { ssid, bssid, channel,  city, province, notes, scan, encryption, num_clients } = req.body;

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
          .insert({ ssid, bssid, channel, city, province, notes, encryption, num_clients, scan })  // Save metadata here
          .select('network_id')
          .single();
        
        if (insertErr) throw insertErr;
        network = newNet;
      } else {
        // optional: update metadata if user edits it
        await supabaseClient
          .from('networks')
          .update({ city, province, notes })
          .eq('network_id', network.network_id);
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

async function saveNetworkMetadataScan(req, res) {  // POST /api/rasPi/networks
  try {
    const { ssid, bssid, channel, city, province, notes, encryption, num_clients, scan } = req.body;

    if (!ssid || !bssid || channel === undefined) {
      return res.status(400).json({ status: 'ERROR', error: 'Missing ssid/bssid/channel' });
    }

    // 1. Upsert network (create if missing, update metadata)
    let { data: network, error: lookupErr } = await supabaseClient
      .from('networks')
      .select('network_id')
      .eq('bssid', bssid)
      .maybeSingle();

    if (lookupErr) throw lookupErr;

    if (!network) {
      // Insert new
      const { data: newNet, error: insertErr } = await supabaseClient
        .from('networks')
        .insert({ ssid, bssid, channel, city, province, notes, encryption, num_clients })
        .select('network_id, *')
        .single();
      if (insertErr) throw insertErr;
      network = newNet;
    } else {
      // Update metadata
      const { error: updateErr } = await supabaseClient
        .from('networks')
        .update({ city, province, notes, encryption, num_clients })
        .eq('network_id', network.network_id);
      if (updateErr) throw updateErr;
    }

    // 2. Insert scan (linked to network_id)
    if (scan) {
      const { error: scanErr } = await supabaseClient
        .from('scans')
        .insert({
          network_id: network.network_id,
          scan_data: scan,  // Full FastAPI result (JSONB or text)
          scan_start: scan.scan_start || new Date().toISOString(),
          scan_end: scan.scan_end || null,
        });
      if (scanErr) throw scanErr;
    }

    return res.status(201).json({
      status: 'OK',
      network_id: network.network_id,
      network: network
    });
  } catch (err) {
    console.error('Save network/metadata/scan error:', err);
    return res.status(500).json({
      status: 'ERROR',
      error: 'Failed to save network data',
      detail: err.message
    });
  }
}



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

module.exports = { triggerScan, getNetworksList, saveNetworkMetadataScan,insertMetadata, getAccessPointDetails };
