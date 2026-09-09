import { useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { enqueueNormalPrintJob, PRINTER_KITCHEN, PRINTER_DCR3 } from '../lib/printJobs.js';
import AdminReprintPasswordSetup from '../components/AdminReprintPasswordSetup.jsx';

// Admin/Super Admin only (App.jsx gates the tab itself). Printer config
// lives in the `printers` table, not localStorage - every device sees the
// same IP/Windows-printer-name. Actual physical printing happens on the
// Print Agent (print-agent/), a separate Windows process that polls
// `print_jobs` - this screen only edits the two printer rows and queues
// test-print jobs, it never talks to a printer directly.
export default function PrinterSettingsTab() {
  const [printers, setPrinters, loaded] = useSupabaseTable('printers', []);
  const [testStatus, setTestStatus] = useState({});

  const kitchen = printers.find((p) => p.id === PRINTER_KITCHEN);
  const dcr3 = printers.find((p) => p.id === PRINTER_DCR3);

  function updatePrinter(id, patch) {
    setPrinters(printers.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)));
  }

  async function testPrint(printer) {
    setTestStatus((s) => ({ ...s, [printer.id]: { busy: true } }));
    try {
      await enqueueNormalPrintJob({
        referenceId: `test-${printer.id}-${Date.now()}`,
        printType: 'test',
        station: printer.station,
        printerId: printer.id,
        payload: { title: printer.id === PRINTER_KITCHEN ? 'KITCHEN PRINTER TEST' : 'DCR3 PRINTER TEST', printerName: printer.name },
        idempotencyKey: null
      });
      setTestStatus((s) => ({ ...s, [printer.id]: { busy: false, ok: true, message: 'Test print queued.' } }));
    } catch (err) {
      setTestStatus((s) => ({ ...s, [printer.id]: { busy: false, ok: false, message: err.message || 'Test print queue nahi ho paya.' } }));
    }
  }

  if (!loaded) return <p className="text-muted text-sm">Loading...</p>;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold mb-1">Printer Settings</h2>
        <p className="text-muted text-sm mb-3.5">
          Physical printing browser se nahi hota — ye settings sirf configure karti hain ki Print Agent (Admin ke Windows PC par chalne wala alag program) kis printer par kya bhejega.
        </p>
      </div>

      {kitchen && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mb-2.5">Kitchen Printer</h3>
          <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
            <div><span className="text-muted text-xs block">Name</span><span className="font-semibold">{kitchen.name}</span></div>
            <div><span className="text-muted text-xs block">Type</span><span className="font-semibold">LAN (Ethernet)</span></div>
          </div>
          <div className="flex gap-2.5 flex-wrap mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted font-semibold">IP Address</label>
              <input value={kitchen.ipAddress || ''} onChange={(e) => updatePrinter(kitchen.id, { ipAddress: e.target.value.trim() || null })} placeholder="e.g. 192.168.1.50" className="px-2.5 py-2 border border-border rounded-md text-sm w-44" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted font-semibold">Port</label>
              <input type="number" value={kitchen.port || ''} onChange={(e) => updatePrinter(kitchen.id, { port: parseInt(e.target.value, 10) || null })} placeholder="9100" className="px-2.5 py-2 border border-border rounded-md text-sm w-24" />
            </div>
          </div>
          <button onClick={() => testPrint(kitchen)} disabled={testStatus[kitchen.id]?.busy} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-bg border border-border hover:text-ink disabled:opacity-60">
            {testStatus[kitchen.id]?.busy ? 'Queueing...' : 'Test Print'}
          </button>
          {testStatus[kitchen.id]?.message && (
            <p className={`text-xs font-semibold mt-1.5 ${testStatus[kitchen.id].ok ? 'text-good' : 'text-bad'}`}>{testStatus[kitchen.id].message}</p>
          )}
          <p className="text-muted text-xs mt-2">IP printer ke network/self-test se milta hai — abhi guess na karein, actual IP configure hone tak khaali chhodein.</p>
        </div>
      )}

      {dcr3 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mb-2.5">Bristo + Bill Printer</h3>
          <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
            <div><span className="text-muted text-xs block">Name</span><span className="font-semibold">{dcr3.name}</span></div>
            <div><span className="text-muted text-xs block">Type</span><span className="font-semibold">Windows USB</span></div>
          </div>
          <div className="flex flex-col gap-1 mb-3 max-w-sm">
            <label className="text-xs text-muted font-semibold">Windows Printer Name</label>
            <input value={dcr3.windowsPrinterName || ''} onChange={(e) => updatePrinter(dcr3.id, { windowsPrinterName: e.target.value.trim() || null })} placeholder="e.g. Retsol DCR3" className="px-2.5 py-2 border border-border rounded-md text-sm" />
            <p className="text-muted text-xs">Windows &gt; Settings &gt; Bluetooth &amp; devices &gt; Printers &amp; scanners mein jo exact naam dikhe, wahi yahan daalein.</p>
          </div>
          <button onClick={() => testPrint(dcr3)} disabled={testStatus[dcr3.id]?.busy} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-bg border border-border hover:text-ink disabled:opacity-60">
            {testStatus[dcr3.id]?.busy ? 'Queueing...' : 'Test Print'}
          </button>
          {testStatus[dcr3.id]?.message && (
            <p className={`text-xs font-semibold mt-1.5 ${testStatus[dcr3.id].ok ? 'text-good' : 'text-bad'}`}>{testStatus[dcr3.id].message}</p>
          )}
        </div>
      )}

      <AdminReprintPasswordSetup />
    </section>
  );
}
