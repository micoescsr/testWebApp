//routes/scanRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /api/rasPi_scan/trigger_scan from React --NOT USED!!!
router.post('/trigger_scan', async (req, res) => {
  try {
    const { ssid } = req.body; //galing sa react

    // Call FastAPI on the Pi
    const response = await axios.post('http://mothership.tail781e52.ts.net:8000/api/rasPi_scan/trigger_scan', { ssid });

    // Here you can save response.data to Supabase etc.
    res.json(response.data);
  } catch (err) {
    console.error('FastAPI error:', err.message);
    res.status(500).json({ error: 'Scan failed' });
  }
});

module.exports = router; 

//TESTING, PAG ITTOGGLE NA UNG ENABLE/DISABLE 

// POST /api/rasPi_scan/signal_ap from React (HARDCODED MUNA UNG DATA COZ WLA PA ROUTES SA REACT)
/* router.post('/signal_ap', async (req, res) => {
  try {
    //const { ssid, bssid, channel, signal } = req.body; //galing sa react - will not use it coz hard-coded muna
    const { toggleState } = req.body;
    console.log("Received toggleState:", toggleState);

    // Call FastAPI on the Pi
    const response = await axios.post('http://kali-raspberrypi.tail781e52.ts.net/api/rasPi_scan/signal_ap', { 
      ssid });

    // Here you can save response.data to Supabase etc.
    res.json(response.data);
  } catch (err) {
    console.error('FastAPI error:', err.message);
    res.status(500).json({ error: 'Scan failed' });
  }
}); */

router.post("/signal_ap", async (req, res) => {
  try {
    const { toggleState } = req.body;

    console.log("Received toggleState:", toggleState);
    console.log(
      toggleState ? "Access Point ENABLED" : "Access Point DISABLED"
    );

    // FOR NOW: just confirm receipt
    res.json({
      success: true,
      status: toggleState ? "Active" : "Disabled",
    });
  } catch (err) {
    console.error("Toggle test error:", err.message);
    res.status(500).json({ error: "Toggle test failed" });
  }
});


module.exports = router;