import { supabase } from './supabase.js';

// Server-side check only - the password hash never leaves Postgres. Even
// if this returns true for a non-admin somehow, verify_admin_reprint_password()
// itself re-checks my_role() and returns false for anyone but admin/super_admin,
// so there is no way to bypass this from the frontend.
export async function verifyAdminReprintPassword(password) {
  const { data, error } = await supabase.rpc('verify_admin_reprint_password', { p_password: password });
  if (error) throw error;
  return data === true;
}
