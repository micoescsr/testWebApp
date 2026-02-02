const { supabaseClient } = require("../config/supabaseClient");

async function insertBatch(threats) {
  const { data, error } = await supabaseClient
    .from("vulnerabilities_threat")
    .insert(threats)
    .select();
  if (error) throw error;
  return data;
}

module.exports = { insertBatch };
