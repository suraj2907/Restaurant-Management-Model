import { useMemo, useState } from 'react';
import { rupee } from '../lib/store.js';
import { enqueueRunningBillPrintJob } from '../lib/printJobs.js';
import { getRunningBillTotals } from '../lib/checkItems.js';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

// Read-only "what does this table owe right now" view - reachable from
// the grid's Eye icon without entering the table (never mutates
// table_state/kotSent). Clearly labeled RUNNING BILL, never "Paid".
// Preserves every KOT round as its own row(s) - the same menu item fired
// in two different rounds shows as two separate lines, never merged into
// one summed quantity (see getRunningBillTotals in lib/checkItems.js).
export default function RunningBillView({ table, tableState, kotTickets, restricted, onCancelItem, onClose }) {
  const [printStatus, setPrintStatus] = useState(null);
  const [printing, setPrinting] = useState(false);

  const { rows, subtotal, nonGstSubtotal, discount, gstPct, gst, deliveryCharge, containerCharge, serviceCharge, total, kotCount } = useMemo(
    () => getRunningBillTotals({ tableState, kotTickets, table, restricted }),
    [tableState, kotTickets, table, restricted]
  );

  // kot_tickets items never carry menuId (see sendToKitchen in
  // BillingTab.jsx) - cancelling a fired row still needs one, since
  // cancelSentItem updates table_state.items by menuId. Resolve it by
  // name against the table's still-current items; a row whose item has
  // since been fully removed from table_state simply can't be cancelled.
  function menuIdFor(name) {
    return tableState?.items?.find((o) => o.name === name)?.menuId || null;
  }

  async function printRunningBill() {
    setPrinting(true);
    setPrintStatus(null);
    try {
      await enqueueRunningBillPrintJob({
        table,
        payload: {
          type: 'running_bill',
          table,
          customerName: tableState?.customerName || null,
          customerPhone: tableState?.customerPhone || null,
          guestCount: tableState?.guestCount || null,
          items: rows.map((o) => ({ name: o.name, qty: o.qty, price: o.price })),
          subtotal, discount, gstPct, gst, total,
          deliveryCharge, containerCharge, serviceCharge,
          printedAt: new Date().toISOString(),
          isReprint: false
        }
      });
      setPrintStatus({ ok: true, message: 'Running bill print queued.' });
    } catch (err) {
      setPrintStatus({ ok: false, message: err.message || 'Print queue nahi ho paya.' });
    }
    setPrinting(false);
  }

  return (
    <Modal open onClose={onClose} title={`Running Bill — ${table}`} wide>
      <div className="text-sm">
        <p className="text-[0.65rem] font-bold uppercase text-secondary-dark bg-secondary/10 rounded px-2 py-1 inline-block mb-2">
          Running Bill — not a final paid invoice
        </p>
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div><span className="text-muted">Customer:</span> <span className="font-semibold">{tableState?.customerName || 'Walk-in'}</span></div>
          <div><span className="text-muted">Phone:</span> <span className="font-semibold">{tableState?.customerPhone || '-'}</span></div>
          <div><span className="text-muted">Guests:</span> <span className="font-semibold">{tableState?.guestCount || '-'}</span></div>
          <div><span className="text-muted">KOTs sent:</span> <span className="font-semibold">{kotCount}</span></div>
        </div>

        {rows.length > 0 ? (
          <div className="mb-3">
            {rows.map((o, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 py-1 border-b border-border last:border-0">
                <span className="flex-1">
                  {o.name} <span className="text-muted">x{o.qty}</span>
                  {o.isNew && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-secondary/15 text-secondary-dark text-[0.6rem] font-bold uppercase">New</span>}
                </span>
                <span className="font-semibold">{rupee(o.price * o.qty)}</span>
                {!o.isNew && !restricted && onCancelItem && menuIdFor(o.name) && (
                  <button
                    onClick={() => onCancelItem(menuIdFor(o.name), o.qty, o.name, o.station)}
                    className="text-bad text-xs font-bold px-1.5 py-0.5 rounded hover:bg-bad/10"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm py-3">Is table par koi item nahi hai.</p>
        )}

        <hr className="border-dashed my-2" />
        <div className="flex justify-between py-1"><span>Subtotal</span><span>{rupee(subtotal)}</span></div>
        {nonGstSubtotal > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Non-GST items</span><span>{rupee(nonGstSubtotal)}</span></div>}
        {discount > 0 && <div className="flex justify-between py-1 text-xs text-bad"><span>Discount</span><span>-{rupee(discount)}</span></div>}
        <div className="flex justify-between py-1"><span>GST ({gstPct}%)</span><span>{rupee(gst)}</span></div>
        {deliveryCharge > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Delivery Charge</span><span>{rupee(deliveryCharge)}</span></div>}
        {containerCharge > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Container Charge</span><span>{rupee(containerCharge)}</span></div>}
        {serviceCharge > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Service Charge</span><span>{rupee(serviceCharge)}</span></div>}
        <div className="flex justify-between items-center font-bold text-base bg-accent text-white rounded-lg px-2.5 py-2 my-2">
          <span>Current Total</span><span>{rupee(total)}</span>
        </div>

        {printStatus && (
          <p className={`text-xs font-semibold ${printStatus.ok ? 'text-good' : 'text-bad'}`}>{printStatus.ok ? '✓ ' : '⚠ '}{printStatus.message}</p>
        )}
      </div>
      <ModalActions>
        <Btn variant="primary" onClick={printRunningBill} disabled={printing}>{printing ? 'Queueing...' : 'Print Running Bill'}</Btn>
        <Btn onClick={onClose}>Close</Btn>
      </ModalActions>
    </Modal>
  );
}
