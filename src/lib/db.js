import { supabase } from './supabase.js';
import { toSnake } from './useSupabaseTable.js';

// For writing into a table a component isn't itself subscribed to via
// useSupabaseTable (e.g. Staff tab logging an expense, Inventory logging a
// vendor purchase). Accepts the same camelCase shape as everywhere else.
export async function dbInsert(table, row) {
  const { error } = await supabase.from(table).insert(toSnake(row));
  if (error) console.error(`[${table}] insert failed:`, error.message, row);
}

export async function getSetting(key, fallback) {
  const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  return data ? data.value : fallback;
}

export async function setSetting(key, value) {
  return supabase.from('settings').upsert({ key, value });
}

// Sequential, human-friendly order numbers (1001, 1002, ...), shared across
// every device since it now lives in the database instead of localStorage.
export async function nextOrderNumber() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'rm_order_seq').maybeSingle();
  const next = (data?.value || 1000) + 1;
  await supabase.from('settings').upsert({ key: 'rm_order_seq', value: next });
  return next;
}
