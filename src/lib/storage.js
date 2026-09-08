import { supabase } from './supabase.js';

// Restaurant logo: uploaded to the public `branding` bucket, each upload
// gets a fresh timestamped filename (not a fixed `logo.png`) so the
// browser never serves a stale cached image after a re-upload - no manual
// cache-busting query param needed.
export async function uploadLogo(file) {
  const ext = file.name.split('.').pop() || 'png';
  const path = `logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('branding').upload(path, file, { cacheControl: '31536000' });
  if (error) throw error;
  const { data } = supabase.storage.from('branding').getPublicUrl(path);
  return data.publicUrl;
}
