import 'dotenv/config';

export const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  kitchenPrinterIp: process.env.KITCHEN_PRINTER_IP || '',
  kitchenPrinterPort: Number(process.env.KITCHEN_PRINTER_PORT || 9100),

  dcr3WindowsPrinterName: process.env.DCR3_WINDOWS_PRINTER_NAME || '',

  pollMs: Number(process.env.POLL_MS || 1500),
  maxAttempts: Number(process.env.MAX_ATTEMPTS || 3)
};

if (!config.supabaseUrl) {
  throw new Error('SUPABASE_URL missing - copy .env.example to .env and fill it in');
}
if (!config.serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY missing - copy .env.example to .env and fill it in');
}
