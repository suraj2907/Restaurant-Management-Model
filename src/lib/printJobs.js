import { supabase } from './supabase.js';

export const PRINTER_KITCHEN = 'printer-kitchen';
export const PRINTER_DCR3 = 'printer-dcr3';

// Normal (non-reprint) print job - no password, allowed for anyone with
// billing write access. Idempotent via idempotencyKey: a duplicate call
// with the same key (e.g. a double-click) returns the existing job's id
// instead of creating a second physical print.
export async function enqueueNormalPrintJob({ referenceId, printType, station, printerId, payload, tableName, orderNo, idempotencyKey }) {
  const { data, error } = await supabase.rpc('enqueue_print_job', {
    p_reference_id: referenceId,
    p_print_type: printType,
    p_station: station,
    p_printer_id: printerId,
    p_payload: payload,
    p_is_reprint: false,
    p_table_name: tableName ?? null,
    p_order_no: orderNo ?? null,
    p_idempotency_key: idempotencyKey ?? null
  });
  if (error) throw error;
  return data;
}

// Reprint - admin/super_admin only, enforced inside the RPC itself (there
// is no is_reprint parameter to spoof). Call verifyAdminReprintPassword()
// first; this alone does not check the password.
export async function enqueueReprintJob({ referenceId, printType, station, printerId, payload, tableName, orderNo }) {
  const { data, error } = await supabase.rpc('enqueue_reprint_job', {
    p_reference_id: referenceId,
    p_print_type: printType,
    p_station: station,
    p_printer_id: printerId,
    p_payload: payload,
    p_table_name: tableName ?? null,
    p_order_no: orderNo ?? null
  });
  if (error) throw error;
  return data;
}
