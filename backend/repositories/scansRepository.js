const { supabaseClient } = require("../config/supabaseClient");

async function insertScan(data) {
  const { data: result, error } = await supabaseClient
    .from("scans")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

module.exports = { insertScan };
