import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

// Postgres columns are snake_case; every component in this app reads/writes
// camelCase objects (exactly like the old localStorage records). Convert at
// the boundary so no component code has to change.
//
// "table" is a reserved SQL keyword, so bills/reservations use the column
// table_name - but every component reads/writes plain `.table`, since that
// has no case-transition for the generic converter to catch. Alias it.
const FIELD_ALIASES_TO_SNAKE = { table: 'table_name' };
const FIELD_ALIASES_TO_CAMEL = { table_name: 'table' };

export function toCamel(row) {
  const out = {};
  for (const k in row) {
    const key = FIELD_ALIASES_TO_CAMEL[k] || k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    out[key] = row[k];
  }
  return out;
}
export function toSnake(row) {
  const out = {};
  for (const k in row) {
    const key = FIELD_ALIASES_TO_SNAKE[k] || k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    out[key] = row[k];
  }
  return out;
}

// Drop-in replacement for useLocalState(key, initial) backed by a Supabase
// table instead of localStorage: same [rows, setRows] shape, but writes are
// diffed against the previous snapshot and pushed as upsert/delete calls,
// and a realtime subscription pulls in changes made from other devices.
export function useSupabaseTable(table, initial = []) {
  const [rows, setRows] = useState(initial);
  const prevRef = useRef(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.from(table).select('*').then(({ data, error }) => {
      if (!active) return;
      if (!error && data) {
        const camel = data.map(toCamel);
        setRows(camel);
        prevRef.current = camel;
      }
      setLoaded(true);
    });

    const channel = supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, async () => {
        const { data } = await supabase.from(table).select('*');
        if (data && active) {
          const camel = data.map(toCamel);
          setRows(camel);
          prevRef.current = camel;
        }
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [table]);

  function setRowsAndSync(next) {
    const resolved = typeof next === 'function' ? next(rows) : next;
    setRows(resolved);
    syncDiff(prevRef.current, resolved);
    prevRef.current = resolved;
  }

  async function syncDiff(prev, next) {
    const nextIds = new Set(next.map((r) => r.id));
    const toDelete = prev.filter((r) => !nextIds.has(r.id)).map((r) => r.id);
    const toUpsert = next
      .filter((r) => {
        const old = prev.find((p) => p.id === r.id);
        return !old || JSON.stringify(old) !== JSON.stringify(r);
      })
      .map(toSnake);
    if (toDelete.length) {
      const { error } = await supabase.from(table).delete().in('id', toDelete);
      if (error) console.error(`[${table}] delete failed:`, error.message);
    }
    if (toUpsert.length) {
      const { error } = await supabase.from(table).upsert(toUpsert);
      if (error) console.error(`[${table}] upsert failed:`, error.message, toUpsert);
    }
  }

  return [rows, setRowsAndSync, loaded];
}
