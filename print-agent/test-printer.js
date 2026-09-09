// Standalone printer connectivity test - does NOT touch Supabase/print_jobs
// at all, just talks to the physical printer directly so you can verify
// wiring/config before the agent's queue is involved.
//
// Usage:
//   node test-printer.js kitchen
//   node test-printer.js dcr3

import { config } from './config.js';
import { buildTest } from './escpos.js';
import { printKitchenRaw, printDcr3Raw } from './printer.js';

const target = process.argv[2];

async function main() {
  if (target === 'kitchen') {
    console.log(`Testing Kitchen printer (Retsol RTP-80) at ${config.kitchenPrinterIp || '(not configured)'}:${config.kitchenPrinterPort}...`);
    const buffer = buildTest({ title: 'KITCHEN PRINTER TEST\nRetsol RTP-80\nConnection: LAN', printerName: 'Retsol RTP-80' });
    await printKitchenRaw(buffer);
    console.log('Kitchen printer test successful.');
  } else if (target === 'dcr3') {
    console.log(`Testing DCR3 printer (Bristo + Bill) via Windows printer "${config.dcr3WindowsPrinterName || '(not configured)'}"...`);
    const buffer = buildTest({ title: 'DCR3 PRINTER TEST\nBistro + Bill\nConnection: Windows USB', printerName: config.dcr3WindowsPrinterName });
    await printDcr3Raw(buffer);
    console.log('DCR3 printer test successful.');
  } else {
    console.log('Usage: node test-printer.js kitchen | dcr3');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Printer test failed: ${err.message}`);
  process.exit(1);
});
