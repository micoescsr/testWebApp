//routes/scanRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();



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

// NOTE: /signal_ap was migrated to routes/deviceMgmtRoutes.js


module.exports = router;