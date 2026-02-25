// repositories/userRepository.js
const { supabaseClient } = require("../config/supabaseClient");

// simple entity shape
function mapRowToProfile(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status || "active",  // ← add this
  };
}


async function findAllProfiles(limit = 50) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .limit(limit);

  if (error) throw error;
  return data.map(mapRowToProfile);
}

async function findProfileById(id) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return mapRowToProfile(data);
}

async function insertProfile(user) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .insert(user)
    .select()
    .single();

  if (error) throw error;
  return mapRowToProfile(data);
}

async function updateProfile(id, updates) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return mapRowToProfile(data);
}

//added for auth routes


module.exports = {
  findAllProfiles,
  findProfileById,
  insertProfile,
  updateProfile
};

//added for auth routes

// findEmailByUsername(username) -- not sure lng since we will implement email
// findByAuthUserID(auth_user_id)
// insert(user) -- create user
// findEmailByUsername(username) -- not sure lng since we will implement email
// findByAuthUserID(auth_user_id)
// insert(user) -- create user
//module.exports = { findFirstUsers, insert };
