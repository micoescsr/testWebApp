// routes/networkMetadata.js
const express = require("express");
const router = express.Router();
const { supabaseClient } = require("../config/supabaseClient");

router.get("/network_metadata", async (req, res) => {
  const { bssid } = req.query;

  if (!bssid) {
    return res.status(400).json({ error: "bssid is required" });
  }

  const { data, error } = await supabaseClient
    .from("networks")
    .select("city, province, notes, ssid, channel") // add more if you want
    .eq("bssid", bssid)
    .maybeSingle(); // returns one row or null

  if (error) {
    console.error("network_metadata error:", error);
    return res.status(500).json({ error: "DB error" });
  }

  if (!data) {
    // no metadata yet for this BSSID
    return res.json(null);
  }

  return res.json(data);
});

module.exports = router;
