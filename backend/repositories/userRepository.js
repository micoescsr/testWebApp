// repositories/userRepository.js
const { supabaseClient } = require("../config/supabaseClient");

// simple entity shape (optional but nice)
function mapRowToUser(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    username: row.username,
    email: row.email,
    role: row.role,
  };
}

async function findFirstUsers(limit = 10) {
  const { data, error } = await supabaseClient
    .from("user_account")
    .select("*")
    .limit(limit);

  if (error) {
    console.error("Supabase error:", error);
    throw error;
  }

  return data.map(mapRowToUser);
}

async function insert(assessment) {
  const { data, error } = await supabaseClient
    .from("assessments")
    .insert(assessment)
    .select()
    .single();

  if (error) throw error;
  return data;
}


module.exports = { findFirstUsers, insert };
