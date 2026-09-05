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

export function seedIfEmpty() {
  if (store.get('rm_seeded', false)) return;
  store.set('rm_menu', [
    { id: uid(), name: 'Paneer Butter Masala', category: 'Main Course', price: 220, cost: 90 },
    { id: uid(), name: 'Dal Makhani', category: 'Main Course', price: 180, cost: 60 },
    { id: uid(), name: 'Veg Biryani', category: 'Rice', price: 190, cost: 75 },
    { id: uid(), name: 'Butter Naan', category: 'Bread', price: 40, cost: 12 },
    { id: uid(), name: 'Masala Dosa', category: 'South Indian', price: 110, cost: 35 },
    { id: uid(), name: 'Cold Coffee', category: 'Beverages', price: 90, cost: 25 },
    { id: uid(), name: 'Gulab Jamun', category: 'Dessert', price: 70, cost: 20 },
    { id: uid(), name: 'Veg Spring Roll', category: 'Starters', price: 150, cost: 55 }
  ]);
  store.set('rm_inventory', [
    { id: uid(), name: 'Paneer', unit: 'kg', qty: 8, min: 5 },
    { id: uid(), name: 'Basmati Rice', unit: 'kg', qty: 25, min: 10 },
    { id: uid(), name: 'LPG Cylinder', unit: 'pcs', qty: 2, min: 2 },
    { id: uid(), name: 'Cooking Oil', unit: 'ltr', qty: 6, min: 8 }
  ]);
  store.set('rm_expenses', []);
  store.set('rm_bills', []);
  store.set('rm_tables', ['T1', 'T2', 'T3', 'T4', 'Parcel']);
  store.set('rm_open_orders', {});
  store.set('rm_stock_log', []);
  store.set('rm_staff', []);
  store.set('rm_salary_payments', []);
  store.set('rm_customers', []);
  store.set('rm_seeded', true);
}
