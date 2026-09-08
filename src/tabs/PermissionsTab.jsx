import { useMemo } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';

const RESOURCES = [
  { id: 'billing', label: 'Billing (POS)' },
  { id: 'kitchen', label: 'Kitchen Display' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'reports', label: 'Reports' },
  { id: 'audit', label: 'Cash Audit' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'staff', label: 'Staff' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'customers', label: 'Customers' },
  { id: 'menu', label: 'Menu Setup' }
];

// Super Admin opens this editing role="admin"; an Admin opens it editing
// role="captain" - each only ever controls the tier directly below itself
// (RLS on role_permissions enforces this again server-side too).
export default function PermissionsTab({ role }) {
  const [rows, setRows, loaded] = useSupabaseTable('role_permissions', []);
  const mine = useMemo(() => rows.filter((r) => r.role === role), [rows, role]);
  const roleLabel = role === 'admin' ? 'Admin' : 'Captain';

  function grantFor(resource) {
    return mine.find((r) => r.resource === resource);
  }

  function setGrant(resource, patch) {
    const existing = grantFor(resource);
    const others = rows.filter((r) => !(r.role === role && r.resource === resource));
    if (!patch.canRead && !existing) return; // nothing to remove
    if (!patch.canRead) {
      setRows(others); // no row at all = no access
      return;
    }
    setRows([...others, { id: `${role}:${resource}`, role, resource, canWrite: patch.canWrite ?? existing?.canWrite ?? false }]);
  }

  return (
    <section>
      <h2 className="text-lg font-bold mb-1">{roleLabel} Permissions</h2>
      <p className="text-muted text-sm mb-4">
        Tick karein {roleLabel} ko kaunse tab dikhne chahiye aur wahan sirf dekh sakte hain ya edit bhi kar sakte hain — turant lagu ho jaata hai.
      </p>

      {!loaded && <p className="text-muted text-sm">Loading...</p>}

      {loaded && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 bg-well/50 text-xs font-bold text-muted uppercase">
            <span>Tab</span><span className="text-center">Dikhe</span><span className="text-center">Edit</span>
          </div>
          {RESOURCES.map((r) => {
            const grant = grantFor(r.id);
            return (
              <div key={r.id} className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 border-t border-border items-center">
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent"
                    checked={!!grant}
                    onChange={(e) => setGrant(r.id, { canRead: e.target.checked, canWrite: grant?.canWrite })}
                  />
                </span>
                <span className="text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent"
                    disabled={!grant}
                    checked={!!grant?.canWrite}
                    onChange={(e) => setGrant(r.id, { canRead: true, canWrite: e.target.checked })}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
