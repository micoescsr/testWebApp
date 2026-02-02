// repositories/networksRepository.js (your existing + upsert)
const { supabaseClient } = require("../config/supabaseClient");

async function insert(data) {
  const { data: result, error } = await supabaseClient
    .from("networks")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function upsertNetwork(data) {
  const { data: result, error } = await supabaseClient
    .from("networks")
    .upsert(data, { onConflict: ["SSID", "BSSID"] })
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function getAll() {
  const { data, error } = await supabaseClient
    .from("networks")
    .select("*");  // all columns now
  if (error) throw error;
  return data;
}

module.exports = { insert, upsertNetwork, getAll };
