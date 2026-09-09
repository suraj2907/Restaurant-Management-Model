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

// Running bill / Check Items - both operational, no-password normal
// prints to the same DCR3/bistro_bill printer as bristo KOTs and final
// bills. Check Items is deliberately never idempotent (section 45) - each
// explicit click is its own print, unlike the "don't duplicate on a
// double-click" protection normal KOT/bill prints get.
export async function enqueueRunningBillPrintJob({ table, payload }) {
  return enqueueNormalPrintJob({
    referenceId: `running-${table}-${Date.now()}`,
    printType: 'running_bill',
    station: 'bistro_bill',
    printerId: PRINTER_DCR3,
    payload,
    tableName: table,
    idempotencyKey: null
  });
}

// Check Items print is Admin/Super Admin only - not password-gated (same
// as Running Bill, an ordinary operational print). The role check happens
// inside enqueue_check_items_job() itself, so this can never be called
// successfully by a Captain even via a direct RPC call from the browser
// console. Station/printer are hardcoded server-side, not accepted here.
export async function enqueueCheckItemsPrintJob({ table, payload }) {
  const { data, error } = await supabase.rpc('enqueue_check_items_job', {
    p_reference_id: `check-${table}-${Date.now()}`,
    p_payload: payload,
    p_table_name: table
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
