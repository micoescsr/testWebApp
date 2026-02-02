/* 
// services/rasPiService.js 
const rasPiRepository = require("../repositories/rasPiRepository.js");

async function insertMetadata(metadata) {
  return rasPiRepository.insert(metadata);
}

async function getAccessPointDetails() {
  return rasPiRepository.getAccessPointDetails();
}

module.exports = { insertMetadata, getAccessPointDetails };

/-* return assessmentRepository.insert({
    userId,
    networkId: payload.networkId,
    metrics,
    score,
    createdAt: new Date(), //need to coordinate with the raspi, kung iccompare ung real-time scanning ng raspi vs db time
});
}

module.exports = { createFromApp }; *-/
 */




/* // services/rasPiService.js v1 (not working kasi array of scans sya)
const networksRepo = require("../repositories/networksRepository");  // rename your repo
const scansRepo = require("../repositories/scansRepository");
const vulnThreatRepo = require("../repositories/vulnerabilitiesThreatRepository");
const vtDetailsRepo = require("../repositories/vtdRepository");

async function insertMetadata(payload) {
  const { agent_id, ssids } = payload;  // expect array of scans
  const userId = 2;  // hardcoded per your spec

  const results = [];
  for (const scan of ssids) {  // handle batch
    const result = await orchestrateSingleScan(userId, scan);
    results.push(result);
  }
  return { success: true, scans: results };
}

async function orchestrateSingleScan(userId, scan) {
  // 1. networks (your existing table)
  const network = await networksRepo.upsertNetwork({
    user_id: userId,
    SSID: scan.ssid,
    Num_clients: scan.num_clients,
    BSSID: scan.bssid,
    Status: scan.status,
    Channel: scan.channel,
    Encryption_status: scan.findings?.encryption?.value || null,
    Security_status: "ASSESSED"  // computed
  });

  // 2. scans
  const scanRecord = await scansRepo.insertScan({
    network_id: network.network_id,
    user_id: userId,
    scan_type: "WIFI_KISMET",
    scan_start: scan.scan_start,
    scan_end: scan.scan_end,
    scan_status: "COMPLETED"
  });

  // 3. vulnerabilities_threat (3 rows: encryption, wps, mfp)
  const threats = [];
  for (const [type, finding] of Object.entries(scan.findings || {})) {
    const vtDetail = await vtDetailsRepo.getByCode(finding.id);
    threats.push({
      scan_id: scanRecord.scan_id,
      vt_name: finding.id,  // "WFVT-002"
      vt_status: finding.status,
      vt_value: finding.value,
      vt_detail_id: vtDetail?.vt_detail_id || null
    });
  }
  await vulnThreatRepo.insertBatch(threats);

  return {
    network_id: network.network_id,
    scan_id: scanRecord.scan_id,
    threats_created: threats.length
  };
}

async function getAccessPointDetails() {
  return networksRepo.getAll();  // enhanced version
}

module.exports = { insertMetadata, getAccessPointDetails, orchestrateSingleScan };
 */




// services/rasPiService.js (expects one scan at a time)
const { supabaseClient } = require("../config/supabaseClient");

async function insertMetadata(scan) {
  const userId = 2;
  return handleSingleScan(userId, scan);
}

async function handleSingleScan(userId, scan) {
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

module.exports = { insertMetadata };
