// controllers/dashboardController.js
//
// Dashboard endpoints — summary, per-network, network list, scan list.
// All routes require JWT (applied in dashboardRoutes.js).

const dashboardService = require("../services/dashboardService");
const { isValidDateString } = require("../utils/asOfAggregation");

// GET /api/dashboard/summary
// Optional query param: ?asOf=YYYY-MM-DD — historical summary (latest
// completed scan per network as of the end of that date, Manila time).
// Absent → latest summary (unchanged behavior).
exports.getSummary = async (req, res) => {
  try {
    const { asOf } = req.query;
    if (asOf !== undefined && !isValidDateString(asOf)) {
      return res
        .status(400)
        .json({ error: "Invalid asOf date. Expected YYYY-MM-DD." });
    }
    const data = await dashboardService.getSummaryData(asOf || null);
    return res.json(data);
  } catch (err) {
    console.error("[dashboard/summary]", err);
    return res
      .status(500)
      .json({ error: "Failed to load summary" });
  }
};

// GET /api/dashboard/networks
exports.getNetworks = async (req, res) => {
  try {
    const data = await dashboardService.getNetworksList();
    return res.json(data);
  } catch (err) {
    console.error("[dashboard/networks]", err);
    return res
      .status(500)
      .json({ error: "Failed to load networks" });
  }
};

// GET /api/dashboard/network/:networkId
// Optional query param: ?scanId=<uuid>
exports.getNetwork = async (req, res) => {
  try {
    const { networkId } = req.params;
    const { scanId } = req.query; // optional — if absent, returns latest
    const data = await dashboardService.getNetworkDashboard(
      networkId,
      scanId || null
    );
    return res.json(data);
  } catch (err) {
    console.error("[dashboard/network]", err);
    return res
      .status(500)
      .json({ error: "Failed to load network dashboard" });
  }
};

// GET /api/dashboard/network/:networkId/scans
exports.getScans = async (req, res) => {
  try {
    const { networkId } = req.params;
    const data = await dashboardService.getScansForNetwork(networkId);
    return res.json(data);
  } catch (err) {
    console.error("[dashboard/scans]", err);
    return res
      .status(500)
      .json({ error: "Failed to load scans" });
  }
};
