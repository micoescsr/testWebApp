// backend/services/authService.js
const authRepository = require('../repositories/authRepository');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

class AuthService {
  async saLogin(username, password) {
    // Verify SA via Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.signInWithPassword({
      email: username,
      password
    });

    if (error || user?.user_metadata?.role !== 'super_admin') {
      throw new Error('Invalid SA credentials');
    }

    // Generate custom SA JWT (or use Supabase JWT)
    return supabaseAdmin.auth.generateLink({ type: 'magiclink', email: username });
  }

  async saOtpAuthorize(user_id, otp_code) {
    // Verify OTP + SA privileges (from middleware)
    const authorized = await authRepository.validateOtp(user_id, otp_code);
    
    if (!authorized) {
      throw new Error('Invalid OTP');
    }

    // Generate user-scoped token
    const { data: { session } } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: authorized.email
    });

    await authRepository.markUserAuthorized(user_id);
    return { token: session.access_token };
  }

  async getSaUsers() {
    return authRepository.getAllUsersWithStatus();
  }

  async saSendOtp(user_id) {
    return authRepository.createOtpForUser(user_id);
  }

  async saRevokeUser(user_id) {
    return authRepository.revokeUser(user_id);
  }
}

module.exports = new AuthService();
