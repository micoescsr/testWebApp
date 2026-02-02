//routes/scanRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /api/rasPi_scan/trigger_scan from React
router.post('/trigger_scan', async (req, res) => {
  try {
<<<<<<< Updated upstream
    const { ssid } = req.body; //galing sa react

    // Call FastAPI on the Pi
    const response = await axios.post('http://kali-raspberrypi.tail781e52.ts.net/api/rasPi_scan/trigger_scan', { ssid });
=======
    const { ssid} = req.body; //galing sa react

    // Call FastAPI on the Pi
    const response = await axios.post('http://127.0.0.1:8000/api/rasPi_scan/trigger_scan', { ssid });
>>>>>>> Stashed changes

    // Here you can save response.data to Supabase etc.
    res.json(response.data);
  } catch (err) {
    console.error('FastAPI error:', err.message);
    res.status(500).json({ error: 'Scan failed' });
  }
});

<<<<<<< Updated upstream
module.exports = router; 
=======
module.exports = router;

>>>>>>> Stashed changes

//TESTING, PAG ITTOGGLE NA UNG ENABLE/DISABLE 

// POST /api/rasPi_scan/signal_ap from React (HARDCODED MUNA UNG DATA COZ WLA PA ROUTES SA REACT)
<<<<<<< Updated upstream
/* router.post('/signal_ap', async (req, res) => {
  try {
    //const { ssid, bssid, channel, signal } = req.body; //galing sa react - will not use it coz hard-coded muna
    const { toggleState } = req.body;
    console.log("Received toggleState:", toggleState);

    // Call FastAPI on the Pi
    const response = await axios.post('http://kali-raspberrypi.tail781e52.ts.net/api/rasPi_scan/signal_ap', { 
      ssid });
=======
router.post('/signal_ap', async (req, res) => {
  try {
    //const { ssid, bssid, channel, signal } = req.body; //galing sa react - will not use it coz hard-coded muna

    // Call FastAPI on the Pi
    const response = await axios.post('http://127.0.0.1:8000/api/rasPi_scan/signal_ap', { 
      ssid: "banana", 
      bssid: "macaddress", 
      channel: "9", 
      signal: "enable" });
>>>>>>> Stashed changes

    // Here you can save response.data to Supabase etc.
    res.json(response.data);
  } catch (err) {
    console.error('FastAPI error:', err.message);
    res.status(500).json({ error: 'Scan failed' });
  }
<<<<<<< Updated upstream
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


=======
});

>>>>>>> Stashed changes
module.exports = router;