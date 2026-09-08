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

// KOT tickets show who fired them (name + this label) so kitchen/bar staff
// know at a glance whether to flag an issue to the Captain on the floor or
// straight to Admin.
const ROLE_LABELS = { captain: 'Captain', admin: 'Admin', super_admin: 'Super Admin' };
export const roleLabel = (role) => ROLE_LABELS[role] || role || '';
