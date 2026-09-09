import { useMemo, useState } from 'react';
import { getCheckItemsData } from '../lib/checkItems.js';
import { enqueueCheckItemsPrintJob } from '../lib/printJobs.js';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

// Read-only order-verification screen ("bhai aapke table par ye 2 Paneer,
// 3 Cold Coffee gaye hain") - never changes qty/price, never deletes,
// never fires a KOT. Sourced from kot_tickets (the permanent record of
// what actually went to the kitchen/bar), not table_state alone, so a
// "not yet sent" item never gets miscounted as delivered.
export default function CheckItemsView({ table, tableState, kotTickets, onClose }) {
  const [showKots, setShowKots] = useState(false);
  const [printStatus, setPrintStatus] = useState(null);
  const [printing, setPrinting] = useState(false);

  const data = useMemo(() => getCheckItemsData({ tableState, kotTickets, table }), [tableState, kotTickets, table]);

  async function printCheckItems() {
    setPrinting(true);
    setPrintStatus(null);
    try {
      await enqueueCheckItemsPrintJob({
        table,
        payload: {
          type: 'check_items',
          table,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          guestCount: data.guestCount,
          items: data.sentItems,
          totalQty: data.totalSentQty,
          printedAt: new Date().toISOString()
        }
      });
      setPrintStatus({ ok: true, message: 'Check Items print queued.' });
    } catch (err) {
      setPrintStatus({ ok: false, message: err.message || 'Print queue nahi ho paya.' });
    }
    setPrinting(false);
  }

  return (
    <Modal open onClose={onClose} title={`Check Items — ${table}`} wide>
      <div className="text-sm">
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div><span className="text-muted">Customer:</span> <span className="font-semibold">{data.customerName || 'Walk-in'}</span></div>
          <div><span className="text-muted">Phone:</span> <span className="font-semibold">{data.customerPhone || '-'}</span></div>
        </div>
        <p className="text-muted text-xs -mt-1 mb-3">Customer ke saath cross-check karein — sirf jo actually kitchen/bar bheja gaya hai wahi "Sent" mein dikhega.</p>

        <div className="mb-3">
          <div className="text-xs font-bold text-good uppercase mb-1.5">Sent Items</div>
          {data.sentItems.length === 0 && <p className="text-muted text-sm">Koi item abhi tak bheja nahi gaya.</p>}
          {data.sentItems.map((i) => (
            <div key={i.name} className="flex items-center justify-between py-1 border-b border-border last:border-0">
              <span>{i.name} <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-well text-muted uppercase font-bold ml-1">{i.station}</span></span>
              <span className="font-bold">x{i.qty}</span>
            </div>
          ))}
        </div>

        {data.unsentItems.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-bold text-secondary-dark uppercase mb-1.5">Not Yet Sent</div>
            {data.unsentItems.map((i) => (
              <div key={i.name} className="flex items-center justify-between py-1">
                <span>{i.name}</span>
                <span className="font-bold">x{i.qty}</span>
              </div>
            ))}
          </div>
        )}

        {data.cancelledItems.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-bold text-bad uppercase mb-1.5">Cancelled</div>
            {data.cancelledItems.map((i) => (
              <div key={i.name} className="flex items-center justify-between py-1 text-bad">
                <span>{i.name}</span>
                <span className="font-bold">x{i.qty}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-muted bg-well/60 rounded-lg px-3 py-2 mb-2">
          <span>KOTs: <b className="text-ink">{data.kotCount}</b></span>
          <span>Total Sent Qty: <b className="text-ink">{data.totalSentQty}</b></span>
        </div>

        <button onClick={() => setShowKots((s) => !s)} className="text-xs font-semibold text-accent-dark underline mb-2">
          {showKots ? 'Hide' : 'Show'} KOT Details
        </button>

        {showKots && (
          <div className="flex flex-col gap-2 mb-2">
            {data.kots.map((kot) => (
              <div key={kot.id} className={`text-xs border rounded-lg p-2 ${kot.status === 'cancelled' ? 'border-bad/30 bg-bad/5' : 'border-border bg-bg'}`}>
                <div className="flex justify-between font-semibold mb-1">
                  <span>{kot.orderNo ? `#${kot.orderNo}` : kot.id.slice(-6)} {kot.status === 'cancelled' && '(Cancelled)'}</span>
                  <span className="text-muted">{new Date(kot.firedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</span>
                </div>
                {(kot.items || []).map((i, idx) => (
                  <div key={idx} className="flex justify-between text-muted">
                    <span>{i.name}</span><span>x{i.qty}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {printStatus && (
          <p className={`text-xs font-semibold ${printStatus.ok ? 'text-good' : 'text-bad'}`}>{printStatus.ok ? '✓ ' : '⚠ '}{printStatus.message}</p>
        )}
      </div>
      <ModalActions>
        <Btn variant="primary" onClick={printCheckItems} disabled={printing}>{printing ? 'Queueing...' : 'Print Check Items'}</Btn>
        <Btn onClick={onClose}>Close</Btn>
      </ModalActions>
    </Modal>
  );
}
