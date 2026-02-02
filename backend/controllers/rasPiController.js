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


// controllers/rasPiController.js (unchanged structure pero sabi minimal change)
const rasPiService = require("../services/rasPiService");

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

module.exports = { insertMetadata, getAccessPointDetails };
