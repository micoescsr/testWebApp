const { supabaseClient } = require("../config/supabaseClient");

async function getByCode(vtCode) {
  const { data, error } = await supabaseClient
    .from("vulnerability_threat_details")
    .select("vt_detail_id")
    .eq("vt_code", vtCode)
    .maybeSingle();  // returns null if not found
  if (error) throw error;
  return data;
}

module.exports = { getByCode };
