// services/rasPiService.js (expects one scan at a time)
const { supabaseClient } = require("../config/supabaseClient");

async function insertScanResults(scan) {
  const userId = 2; //hardcoded pa 
  return handleSingleScan(userId, scan);
}

async function handleSingleScan(userId, scan) {  //to refine
  // 1) networks
  const { data: network, error: netErr } = await supabaseClient
    .from("networks")
    .insert({
      user_id: userId,
      SSID: scan.ssid,
      Num_clients: scan.num_clients,
      BSSID: scan.bssid,
      Status: scan.status,
      Channel: scan.channel,
      Encryption_status: scan.findings?.encryption?.value || null,
      Security_status: "ASSESSED",
    })
    .select()
    .single();
  if (netErr) throw netErr;

  // 2) scans
  const { data: scanRow, error: scanErr } = await supabaseClient
    .from("scans")
    .insert({
      network_id: network.network_id,
      user_id: userId,
      scan_type: "WIFI_KISMET",
      scan_start: scan.scan_start,
      scan_end: scan.scan_end,
      scan_status: "COMPLETED",
    })
    .select()
    .single();
  if (scanErr) throw scanErr;

  // 3) vulnerabilities_threat
  const vulnRows = [];
  for (const [, finding] of Object.entries(scan.findings || {})) {
    const { data: detail, error: detailErr } = await supabaseClient
      .from("vulnerability_threat_details")
      .select("vt_detail_id")
      .eq("vt_code", finding.id)
      .maybeSingle();
    if (detailErr) throw detailErr;

    vulnRows.push({
      scan_id: scanRow.scan_id,
      vt_name: finding.id,
      vt_status: finding.status,
      vt_value: finding.value,
      vt_detail_id: detail?.vt_detail_id || null,
    });
  }

  const { data: insertedThreats, error: vulnErr } = await supabaseClient
    .from("vulnerabilities_threat")
    .insert(vulnRows)
    .select();
  if (vulnErr) throw vulnErr;

  return {
    network_id: network.network_id,
    scan_id: scanRow.scan_id,
    threats_created: insertedThreats.length,
  };
}

module.exports = { insertScanResults };
