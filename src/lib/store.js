export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const rupee = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const thisMonthStr = () => todayStr().slice(0, 7);

// Months elapsed (inclusive) between a join date and the current month.
export function monthsElapsed(joinDate) {
  const j = new Date(joinDate + 'T00:00:00');
  const now = new Date();
  return (now.getFullYear() - j.getFullYear()) * 12 + (now.getMonth() - j.getMonth()) + 1;
}

// 1 loyalty point per ₹100 spent.
export const POINTS_PER_RUPEE = 100;

// Only a few things stay device-local now: the list of table names, and
// whichever order each table currently has "in progress" (not yet billed).
// Everything else (menu, bills, staff, inventory, etc.) lives in Supabase -
// see supabase-schema.sql for the seed data on that side.
export function seedIfEmpty() {
  if (store.get('rm_seeded', false)) return;
  store.set('rm_tables', ['T1', 'T2', 'T3', 'T4', 'Parcel']);
  store.set('rm_open_orders', {});
  store.set('rm_kot_sent', {});
  store.set('rm_seeded', true);
}
