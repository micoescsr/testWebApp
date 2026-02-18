// backend/repositories/authRepository.js

const { supabaseClient } = require('../config/supabaseClient');

class AuthRepository {

  async getAllUsersWithStatus() {
    const { data, error } = await supabaseClient
      .from('user_account')
      .select(`
        id,
        username,
        sa_authorized,
        authorized_at,
        profiles!inner(role)
      `);

    if (error) throw error;
    return data;
  }

  async markUserAuthorized(user_id) {
    const { error } = await supabaseClient
      .from('user_account')
      .update({ 
        sa_authorized: true, 
        authorized_at: new Date().toISOString() 
      })
      .eq('id', user_id);

    if (error) throw error;
  }

  async revokeUser(user_id) {
    await supabaseClient
      .from('user_account')
      .update({ sa_authorized: false, authorized_at: null })
      .eq('id', user_id);

    await supabaseClient
      .from('profiles')
      .update({ role: 'pending' })
      .eq('id', user_id);
  }
}

module.exports = new AuthRepository();
