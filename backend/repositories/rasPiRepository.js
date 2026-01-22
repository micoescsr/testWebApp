// repositories/rasPiRepository.js
const { supabaseClient } = require("../config/supabaseClient");

async function insert(insertMetadata) {
  const { data, error } = await supabaseClient
    .from("networks")
    .insert(insertMetadata)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getAccessPointDetails() {
  const { data, error } = await supabaseClient
    .from("networks")
    .select("SSID, Status"); // plus connected clients later
    //dpt may where condition to for selecting specific network SSID
    //.single();

  if (error) throw error;
  return data;
}

module.exports = {insert, getAccessPointDetails};