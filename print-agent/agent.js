import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { buildKot, buildBill, buildTest } from './escpos.js';
import { printKitchenRaw, printDcr3Raw } from './printer.js';

// Service-role key - bypasses RLS entirely, and claim_print_job/
// complete_print_job are GRANTed to the `service_role` Postgres role only
// (see supabase-schema.sql), so this is the only client that can call
// them. Never log this key.
const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const STATIONS = ['kitchen', 'bistro_bill'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// claim_print_job uses `FOR UPDATE SKIP LOCKED` so two agents running at
// once can never claim the same row - safe to run more than one instance.
// When nothing is pending it still returns a row shape (all columns null),
// not a JS null/undefined, so check job.id rather than truthiness of job.
async function processStation(station) {
  const { data: job, error } = await supabase.rpc('claim_print_job', { p_station: station });

  if (error) {
    console.error(`[CLAIM ERROR] ${station}: ${error.message}`);
    return;
  }
  if (!job || !job.id) {
    return;
  }

  try {
    let buffer;

    if (job.print_type === 'kot_kitchen') {
      buffer = buildKot({ ...job.payload, title: 'KITCHEN KOT' });
      await printKitchenRaw(buffer);
    } else if (job.print_type === 'kot_bristo') {
      buffer = buildKot({ ...job.payload, title: 'BRISTO KOT' });
      await printDcr3Raw(buffer);
    } else if (job.print_type === 'bill') {
      buffer = buildBill({ bill: job.payload, isReprint: job.payload?.isReprint === true });
      await printDcr3Raw(buffer);
    } else if (job.print_type === 'test') {
      buffer = buildTest(job.payload || {});
      if (station === 'kitchen') await printKitchenRaw(buffer);
      else await printDcr3Raw(buffer);
    } else {
      throw new Error(`Unknown print type: ${job.print_type}`);
    }

    await supabase.rpc('complete_print_job', { p_job_id: job.id, p_success: true, p_error: null });
    console.log(`[PRINTED] ${job.id} ${station} ${job.print_type} ref=${job.reference_id}`);
  } catch (err) {
    await supabase.rpc('complete_print_job', { p_job_id: job.id, p_success: false, p_error: err.message });
    console.error(`[PRINT FAILED] ${job.id} ${station} ${job.print_type}: ${err.message}`);
  }
}

async function main() {
  console.log('Restaurant Print Agent starting...');
  console.log(`Kitchen (RTP-80): ${config.kitchenPrinterIp ? `${config.kitchenPrinterIp}:${config.kitchenPrinterPort}` : 'NOT CONFIGURED'}`);
  console.log(`Bristo/Bill (DCR3): ${config.dcr3WindowsPrinterName || 'NOT CONFIGURED'}`);
  console.log(`Polling every ${config.pollMs}ms. Press Ctrl+C to stop.`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const station of STATIONS) {
      // A single bad job must never take the whole agent down - each
      // station is processed independently and errors are caught inside
      // processStation() itself.
      // eslint-disable-next-line no-await-in-loop
      await processStation(station);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(config.pollMs);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
