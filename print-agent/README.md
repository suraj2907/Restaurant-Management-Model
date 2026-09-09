# Restaurant Print Agent

A small standalone Node.js process that runs on the Admin's Windows PC and does the actual physical printing. The web app never talks to a printer directly — it writes a row into Supabase's `print_jobs` table, and this agent polls for pending jobs and sends raw ESC/POS bytes to the real printer.

## Architecture

```
React Web App
     |
     v
  Supabase (print_jobs)
     |
     v
  Print Agent (this folder, runs on the Admin PC)
     /                        \
    v                          v
Retsol RTP-80              Retsol DCR3
Kitchen KOT                Bristo KOT + Bill
Ethernet/LAN                USB (Windows spooler)
```

- **Kitchen KOT** → Retsol RTP-80 → sent over the LAN as a raw TCP ESC/POS stream (`printer.js`'s `printKitchenRaw`).
- **Bristo KOT + Bill** → Retsol DCR3 → same physical printer for both, connected via USB to this PC, addressed through the normal Windows print spooler (`printDcr3Raw`, via `@maxxuxx/node-printer`'s `winspool` transport) — never a WinUSB/Zadig driver swap, it stays a normal Windows printer the whole time.

## 1. Install Node.js

Install Node.js 20 LTS or later on the Admin Windows PC: https://nodejs.org

## 2. Connect the DCR3 and find its exact Windows printer name

1. Connect the DCR3 via USB and install its Windows driver if Windows doesn't detect it automatically.
2. Open **Settings → Bluetooth & devices → Printers & scanners**.
3. Note the *exact* name shown there (e.g. `Retsol DCR3`) — do not guess it, copy it exactly.
4. You can also confirm from PowerShell:
   ```powershell
   Get-CimInstance Win32_Printer | Select-Object Name, PrinterStatus, WorkOffline
   ```

## 3. Find the RTP-80's IP address

Print the RTP-80's network self-test page (usually a button combo on the printer, or via its own menu) to find its current IP, or check your router's connected-devices list. Do not guess or reuse an example IP — every network is different.

## 4. Configure

```bash
cd print-agent
copy .env.example .env
```

Edit `.env`:

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

KITCHEN_PRINTER_IP=192.168.x.x
KITCHEN_PRINTER_PORT=9100

DCR3_WINDOWS_PRINTER_NAME=Retsol DCR3
```

The service role key is in the Supabase Dashboard → Project Settings → API. **It must never be committed to git or pasted anywhere public** — `.gitignore` already excludes `.env`.

## 5. Install dependencies and test

```bash
npm install
npm run test:printers
```

`test:printers` alone just prints usage — run each printer individually:

```bash
node test-printer.js kitchen
node test-printer.js dcr3
```

Each should print a small test slip and log `... printer test successful.` If it fails, the exact error (timeout, connection refused, printer name not found, etc.) is printed — fix the config and retry before moving on.

## 6. Start the agent

```bash
npm start
```

You should see it log `Restaurant Print Agent starting...` followed by a `[PRINTED] ...` line every time a KOT or bill is fired from the app. Leave this running — it polls Supabase every 1.5s (configurable via `POLL_MS`) for new jobs.

## 7. Auto-start on login (Windows Task Scheduler)

So you don't have to manually run `npm start` every time the PC restarts:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-task.ps1
```

This registers a task that starts the agent automatically when you (the current Windows user) log in, and restarts it automatically if it ever exits. It intentionally runs as your own user account, not SYSTEM — the DCR3 is installed in your Windows printer session, and a SYSTEM-level task generally can't see it.

To remove the task later:

```powershell
Unregister-ScheduledTask -TaskName 'RestaurantPrintAgent' -Confirm:$false
```

## Troubleshooting

- **"Kitchen printer IP not configured" / "DCR3 Windows printer name not configured."** — `.env` is missing that value. Fill it in and restart the agent.
- **"Kitchen printer connection timeout"** — the RTP-80 is unreachable at that IP/port. Confirm it's powered on, on the same network, and the IP hasn't changed (some routers reassign DHCP addresses — consider a static IP/DHCP reservation for the printer).
- **DCR3 print fails with a "printer not found" style error** — the `DCR3_WINDOWS_PRINTER_NAME` doesn't exactly match what's in Windows' Printers & scanners list (it's case- and whitespace-sensitive). Recopy the exact name.
- **A job stays stuck at "pending" / never printed** — the agent isn't running, or is targeting the wrong printer for that job's station. Check the agent's console output; every claimed job logs either `[PRINTED]` or `[PRINT FAILED]`.
- **Printer was offline, now reconnected** — nothing to do manually. A failed job automatically reverts to `pending` (up to 3 attempts, then `failed`) and the agent will pick it up again on its next poll once the printer answers.
- **Two agents running by accident** — safe. `claim_print_job` uses `FOR UPDATE SKIP LOCKED` in Postgres, so the same job can never be claimed by two agents at once.

## Security

- The Supabase **service role key** bypasses Row Level Security entirely and must only ever live in this folder's `.env` file — never in the React app, never in Vite env vars, never committed to git, never pasted into a chat or issue.
- `claim_print_job` and `complete_print_job` are only executable by the `service_role` Postgres role (this agent's connection) — a normal logged-in user, including Admin, cannot call them even if they tried directly against the API.
- The agent never logs the service role key, only job ids/types/stations.
