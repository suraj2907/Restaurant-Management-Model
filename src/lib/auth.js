import { supabase } from './supabase.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

// Creates an Admin/Captain login via the `create-user` Edge Function -
// never with supabase.auth.signUp(), which would swap the *caller's own*
// browser session over to the newly created account.
export async function createUser({ name, email, password, role }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { name, email, password, role },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
