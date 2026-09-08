import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { createUser } from '../lib/auth.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', captain: 'Captain' };

// Super Admin manages Admin + Captain accounts; an Admin manages only
// Captain accounts (enforced again server-side by the create-user function
// and by RLS on `profiles` - this prop just decides what's shown/offered).
export default function UserManagementTab({ viewerRole }) {
  const [profiles, setProfiles, loaded] = useSupabaseTable('profiles', []);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'captain' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const creatable = viewerRole === 'super_admin' ? ['admin', 'captain'] : ['captain'];
  const visible = useMemo(
    () => profiles.filter((p) => (viewerRole === 'super_admin' ? p.role !== 'super_admin' : p.role === 'captain')),
    [profiles, viewerRole]
  );

  async function addUser(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await createUser(form);
      setForm({ name: '', email: '', password: '', role: creatable[0] });
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleActive(p) {
    setProfiles(profiles.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
  }

  return (
    <section>
      <h2 className="text-lg font-bold mb-1">Team / User Management</h2>
      <p className="text-muted text-sm mb-4">
        {viewerRole === 'super_admin' ? 'Admin aur Captain, dono ke login accounts yahan se banaye jaate hain.' : 'Captain ke login accounts yahan se banaye jaate hain.'}
      </p>

      <form onSubmit={addUser} className="flex gap-2.5 flex-wrap items-center mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input required placeholder="Naam" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input required type="password" placeholder="Password (6+ chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="px-2.5 py-2 border border-border rounded-md text-sm">
          {creatable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button disabled={busy} className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark disabled:opacity-60">
          {busy ? 'Bana rahe hain...' : 'Add User'}
        </button>
      </form>
      {err && <p className="text-bad text-sm font-semibold mb-3">{err}</p>}

      <TableScroll>
        <DataTable columns={['Name', 'Role', 'Status', 'Action']}>
          {!loaded && <EmptyRow span={4}>Loading...</EmptyRow>}
          {loaded && visible.length === 0 && <EmptyRow span={4}>Koi user nahi hai abhi.</EmptyRow>}
          {loaded && visible.map((p) => (
            <tr key={p.id}>
              <td className={td}>{p.name}</td>
              <td className={td}>{ROLE_LABEL[p.role] || p.role}</td>
              <td className={td}>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.active ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>
                  {p.active ? 'Active' : 'Deactivated'}
                </span>
              </td>
              <td className={td}>
                <button onClick={() => toggleActive(p)} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border hover:text-ink">
                  {p.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>
    </section>
  );
}
