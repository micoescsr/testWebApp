// backend/repositories/authRepository.js

const { supabaseClient } = require('../config/supabaseClient');

class AuthRepository {
  async validateOtp(user_id, otp_code) {
    const { data, error } = await supabaseClient
      .from('user_otp_tokens')
      .select('*, user_account(email)')
      .eq('user_id', user_id)
      .eq('otp_code', otp_code)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;

    // Mark as used
    await supabaseClient
      .from('user_otp_tokens')
      .update({ used: true })
      .eq('id', data.id);

    return data;
  }

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

  async createOtpForUser(user_id) {
    // Generate 6-digit OTP + insert
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10min

    const { error } = await supabaseClient
      .from('user_otp_tokens')
      .insert({
        user_id,
        otp_code: otp,
        expires_at
      });

    if (error) throw error;

    // TODO: Send SMS/Email via Twilio/Resend
    console.log(`OTP for ${user_id}: ${otp}`); // Replace with real SMS

    return otp;
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
