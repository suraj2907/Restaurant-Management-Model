import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Admin/Super Admin only - sets the one shared password that gates every
// KOT/bill reprint. Never stored client-side beyond the input fields'
// lifetime; cleared immediately after a successful save.
export default function AdminReprintPasswordSetup() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 4) { setError('Password kam se kam 4 characters ka ho.'); return; }
    if (password !== confirm) { setError('Dono password match nahi kar rahe.'); return; }
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_admin_reprint_password', { p_password: password });
      if (rpcError) throw rpcError;
      if (data !== true) throw new Error('Password set nahi ho paya.');
      setPassword('');
      setConfirm('');
      setSuccess('Admin reprint password updated.');
    } catch (err) {
      setError(err.message || 'Password set nahi ho paya.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="font-bold mb-1">Admin Reprint Password</h3>
      <p className="text-muted text-xs mb-3">Ye password KOT aur Bill reprint karte waqt maanga jaata hai - Captain ke paas ye kabhi nahi hoga.</p>
      <form onSubmit={save} className="flex flex-col gap-2.5 max-w-xs">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted font-semibold">New Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted font-semibold">Confirm Password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm" />
        </div>
        {error && <p className="text-bad text-xs font-semibold">{error}</p>}
        {success && <p className="text-good text-xs font-semibold">{success}</p>}
        <button disabled={busy} className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark disabled:opacity-60 w-fit">
          {busy ? 'Saving...' : 'Set Password'}
        </button>
      </form>
    </div>
  );
}
