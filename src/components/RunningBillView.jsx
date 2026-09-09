import { useMemo, useState } from 'react';
import { rupee } from '../lib/store.js';
import { enqueueRunningBillPrintJob } from '../lib/printJobs.js';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

// Fixed default - table_state has no per-table GST rate of its own
// (BillingTab's gstPct slider is a transient UI value for whichever table
// is currently open), and Eye/Printer on the grid must work for ANY
// occupied table without first entering it. This is a running/estimate
// total, not the final bill - the real GST rate applies at Settle time.
const DEFAULT_GST_PCT = 5;

// Read-only "what does this table owe right now" view - reachable from
// the grid's Eye icon without entering the table (never mutates
// table_state/kotSent). Clearly labeled RUNNING BILL, never "Paid".
export default function RunningBillView({ table, tableState, kotTickets, restricted, onCancelItem, onClose }) {
  const [printStatus, setPrintStatus] = useState(null);
  const [printing, setPrinting] = useState(false);

  const { sentRows, unsentRows, subtotal, gstApplicable, nonGstSubtotal, discount, gst, total, kotCount } = useMemo(() => {
    const items = tableState?.items || [];
    const kotSent = tableState?.kotSent || {};
    const sentRows = items
      .map((o) => ({ ...o, sentQty: Math.min(o.qty, kotSent[o.menuId] || 0) }))
      .filter((o) => o.sentQty > 0);
    const unsentRows = items
      .map((o) => ({ ...o, unsentQty: o.qty - Math.min(o.qty, kotSent[o.menuId] || 0) }))
      .filter((o) => o.unsentQty > 0);
    const subtotal = items.reduce((s, o) => s + o.price * o.qty, 0);
    const gstApplicable = items.reduce((s, o) => s + (o.gstIncluded !== false ? o.price * o.qty : 0), 0);
    const nonGstSubtotal = subtotal - gstApplicable;
    // Discount is Admin/Super-Admin only, same rule BillingTab applies to
    // its own total - a Captain viewing/printing a Running Bill never sees
    // or benefits from a discount that isn't theirs to grant.
    const discount = restricted ? 0 : Math.min(tableState?.discount || 0, gstApplicable);
    const taxableAmount = gstApplicable - discount;
    const gst = (taxableAmount * DEFAULT_GST_PCT) / 100;
    const total = taxableAmount + gst + nonGstSubtotal + (tableState?.deliveryCharge || 0) + (tableState?.containerCharge || 0) + (tableState?.serviceCharge || 0);
    const kotCount = (kotTickets || []).filter((k) => k.table === table && k.status !== 'cancelled' && k.status !== 'acknowledged').length;
    return { sentRows, unsentRows, subtotal, gstApplicable, nonGstSubtotal, discount, gst, total, kotCount };
  }, [tableState, kotTickets, table, restricted]);

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
          items: (tableState?.items || []).map((o) => ({ name: o.name, qty: o.qty, price: o.price })),
          subtotal, discount, gstPct: DEFAULT_GST_PCT, gst, total,
          deliveryCharge: tableState?.deliveryCharge || 0, containerCharge: tableState?.containerCharge || 0, serviceCharge: tableState?.serviceCharge || 0,
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

        {sentRows.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-bold text-good uppercase mb-1.5">Sent to Kitchen</div>
            {sentRows.map((o) => (
              <div key={o.menuId} className="flex items-center justify-between gap-2 py-1">
                <span className="flex-1">{o.name} <span className="text-muted">x{o.sentQty}</span></span>
                <span className="font-semibold">{rupee(o.price * o.sentQty)}</span>
                {!restricted && onCancelItem && (
                  <button
                    onClick={() => onCancelItem(o.menuId, o.sentQty, o.name, o.station)}
                    className="text-bad text-xs font-bold px-1.5 py-0.5 rounded hover:bg-bad/10"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {unsentRows.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-bold text-secondary-dark uppercase mb-1.5">Not Yet Sent</div>
            {unsentRows.map((o) => (
              <div key={o.menuId} className="flex items-center justify-between gap-2 py-1">
                <span className="flex-1">{o.name} <span className="text-muted">x{o.unsentQty}</span></span>
                <span className="font-semibold">{rupee(o.price * o.unsentQty)}</span>
              </div>
            ))}
          </div>
        )}

        {sentRows.length === 0 && unsentRows.length === 0 && (
          <p className="text-muted text-sm py-3">Is table par koi item nahi hai.</p>
        )}

        <hr className="border-dashed my-2" />
        <div className="flex justify-between py-1"><span>Subtotal</span><span>{rupee(subtotal)}</span></div>
        {nonGstSubtotal > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Non-GST items</span><span>{rupee(nonGstSubtotal)}</span></div>}
        {discount > 0 && <div className="flex justify-between py-1 text-xs text-bad"><span>Discount</span><span>-{rupee(discount)}</span></div>}
        <div className="flex justify-between py-1"><span>GST ({DEFAULT_GST_PCT}%)</span><span>{rupee(gst)}</span></div>
        {tableState?.deliveryCharge > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Delivery Charge</span><span>{rupee(tableState.deliveryCharge)}</span></div>}
        {tableState?.containerCharge > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Container Charge</span><span>{rupee(tableState.containerCharge)}</span></div>}
        {tableState?.serviceCharge > 0 && <div className="flex justify-between py-1 text-xs text-muted"><span>Service Charge</span><span>{rupee(tableState.serviceCharge)}</span></div>}
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
