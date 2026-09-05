import { todayStr } from './store.js';
import { supabase } from './supabase.js';
import { toCamel, toSnake } from './useSupabaseTable.js';

const RM_KEY_PREFIX = 'rm_';
const DB_TABLES = [
  'menu', 'inventory', 'stock_log', 'restaurant_tables', 'bills', 'expenses',
  'staff', 'salary_payments', 'attendance', 'vendors', 'vendor_purchases',
  'vendor_payments', 'customers', 'loyalty_log', 'reservations', 'settings'
];

export async function downloadBackup() {
  const data = { _localStorage: {} };

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(RM_KEY_PREFIX)) {
      try { data._localStorage[key] = JSON.parse(localStorage.getItem(key)); } catch { /* skip unparsable */ }
    }
  }

  for (const table of DB_TABLES) {
    const { data: rows } = await supabase.from(table).select('*');
    data[table] = (rows || []).map(toCamel);
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `restaurant-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function restoreBackup(file, onDone) {
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      alert('Ye file valid backup nahi hai.');
      return;
    }
    const dbKeys = DB_TABLES.filter((t) => Array.isArray(data[t]) && data[t].length > 0);
    const localKeys = Object.keys(data._localStorage || {});
    if (dbKeys.length === 0 && localKeys.length === 0) {
      alert('Is file mein koi valid data nahi mila.');
      return;
    }
    if (!confirm(`Ye backup load karega. Current data overwrite ho jaayega - continue karein?`)) return;

    for (const table of dbKeys) {
      const rows = data[table].map(toSnake);
      const idField = table === 'restaurant_tables' ? 'name' : table === 'settings' ? 'key' : 'id';
      await supabase.from(table).delete().not(idField, 'is', null);
      await supabase.from(table).insert(rows);
    }
    localKeys.forEach((k) => localStorage.setItem(k, JSON.stringify(data._localStorage[k])));

    onDone?.();
  };
  reader.readAsText(file);
}
