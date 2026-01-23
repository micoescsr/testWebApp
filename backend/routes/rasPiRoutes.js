/* "ssid": ssid_name,
            "status": "FOUND",
            "encryption": encryption,
            "security_status": security_status,
            "hidden_ssid": ssid_len == 0 */


/* 
import requests
from wifi import scan_ssids

API_URL = "http://<your-pc-ip>:3000/api/wifi/scan"

ssids = scan_ssids()
payload = {
    "agent_id": "kali-agent-01",
    "ssids": ssids
}

try:
    response = requests.post(API_URL, json=payload)
    print(response.json())
except Exception as e:
    print("Error sending SSIDs:", e)
*/

// routes/rasPiRoutes.js
const express = require("express");
const app = express();

app.use(express.json());

// Test endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint to receive SSIDs
app.post("/api/rasPi/networks1", (req, res) => {
  console.log("RAW BODY:", req.body); 
  const { agent_id } = req.body;

  if (!agent_id) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  console.log("Scan received from:", agent_id);

  res.json({ status: "received"});
});


const router = express.Router();
const rasPiController = require("../controllers/rasPiController");
const { insertMetadataValidator } = require("../validators/rasPiValidator"); //when it needs to be validated

router.get("/networks", rasPiController.getAccessPointDetails);
router.post("/networks", insertMetadataValidator, rasPiController.insertMetadata);

/*fetch("http://localhost:3000/api/users/user_account", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(newUser),
}); */  

module.exports = router;

