// Creates an Admin or Captain login (auth user + profiles row) without
// disturbing the calling browser's own session - supabase-js's client-side
// signUp() logs the *browser* into the new account, which would kick the
// Super Admin/Admin out of their own session mid-setup. This runs
// server-side with the service-role key instead.
//
// Deploy: supabase functions deploy create-user
// Secret:  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role key>
//          (SUPABASE_URL and SUPABASE_ANON_KEY are already provided automatically)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const anon = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: caller }, error: callerErr } = await anon.auth.getUser();
    if (callerErr || !caller) return json({ error: 'Not authenticated' }, 401);

    const { data: callerProfile } = await anon.from('profiles').select('role, active').eq('id', caller.id).maybeSingle();
    if (!callerProfile?.active) return json({ error: 'Account not active' }, 403);

    const { name, email, password, role } = await req.json();
    if (!name || !email || !password || !role) return json({ error: 'name, email, password, role are required' }, 400);
    if (!['admin', 'captain', 'inventory'].includes(role)) return json({ error: 'role must be admin, captain or inventory' }, 400);
    if (password.length < 6) return json({ error: 'Password kam se kam 6 characters ka ho' }, 400);

    // super_admin can create admin, captain or inventory; admin can create
    // captain or inventory (never another admin).
    const allowed =
      callerProfile.role === 'super_admin' ||
      (callerProfile.role === 'admin' && (role === 'captain' || role === 'inventory'));
    if (!allowed) return json({ error: 'Aapke paas ye account banane ki permission nahi hai' }, 403);

    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const { error: profileErr } = await admin.from('profiles').insert({ id: created.user.id, name, email, role, active: true });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id); // roll back the orphaned auth user
      return json({ error: profileErr.message }, 400);
    }

    return json({ ok: true, id: created.user.id });
  } catch (err) {
    return json({ error: err.message || 'Unexpected error' }, 500);
  }
});
