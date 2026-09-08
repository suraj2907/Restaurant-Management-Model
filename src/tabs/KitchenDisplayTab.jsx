import { useEffect, useMemo, useRef, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { useLocalState } from '../lib/useLocalState.js';
import { rupee, roleLabel } from '../lib/store.js';
import { SkeletonCards } from '../components/Skeleton.jsx';
import { VegMark } from '../components/Icons.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

const DELAY_MINUTES = 15;

function elapsedMinutes(firedAt) {
  return Math.floor((Date.now() - firedAt) / 60000);
}

function TicketCard({ ticket, onMarkReady, onMarkServed, onPrint, stationFilter }) {
  const mins = elapsedMinutes(ticket.firedAt);
  const delayed = mins >= DELAY_MINUTES && ticket.status === 'active';
  const visibleItems = (ticket.items || []).filter((i) => stationFilter === 'all' || (i.station || 'kitchen') === stationFilter);
  if (visibleItems.length === 0) return null;
  return (
    <div className={`rounded-xl border p-3.5 shadow-card flex flex-col gap-2.5 ${delayed ? 'bg-bad/5 border-bad' : 'bg-surface border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-headline-sm text-lg">{ticket.table}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${delayed ? 'bg-bad text-white animate-pulse' : 'bg-well text-muted'}`}>
          {mins <= 0 ? 'Just now' : `${mins} min ago`}
        </span>
      </div>
      {ticket.billerName && <span className="text-[0.68rem] text-muted -mt-1.5">Biller: {ticket.billerName}{ticket.billerRole ? ` (${roleLabel(ticket.billerRole)})` : ''}</span>}
      <div className="flex flex-col gap-1.5">
        {visibleItems.map((item, idx) => (
          <div key={idx} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold">
                <VegMark veg={item.veg !== false} />
                {item.name}
              </span>
              <span className="font-bold">x{item.qty}</span>
            </div>
            {item.note && (
              <div className="text-xs italic text-accent-dark bg-accent/5 rounded px-1.5 py-0.5 mt-0.5 inline-block">{item.note}</div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        <button onClick={() => onPrint(ticket)} className="px-3 py-2 rounded-lg text-sm font-semibold bg-bg border border-border hover:text-ink" title="Ticket dubara print karein">
          🖨
        </button>
        {ticket.status === 'active' && (
          <button onClick={() => onMarkReady(ticket)} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-dark">
            Mark Ready
          </button>
        )}
        {ticket.status === 'ready' && (
          <button onClick={() => onMarkServed(ticket)} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-good text-white hover:opacity-90">
            Mark Served
          </button>
        )}
      </div>
    </div>
  );
}

const STATIONS = [
  { id: 'all', label: 'All (no auto-print)' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bristo', label: 'Bristo / Bar' }
];

export default function KitchenDisplayTab() {
  const [tickets, setTickets, loaded] = useSupabaseTable('kot_tickets', []);
  const [, setTick] = useState(0);
  // Which station THIS device/screen belongs to - a device-local choice
  // (the kitchen tablet stays set to "kitchen" forever, the bristo desktop
  // stays set to "bristo"), not something synced across devices.
  const [stationFilter, setStationFilter] = useLocalState('rm_kitchen_station', 'all');
  // Ticket ids already auto-printed on this device, so a reload doesn't
  // reprint everything still sitting in "active"/"ready".
  const [printedIds, setPrintedIds] = useLocalState('rm_kot_printed_ids', []);
  const [printQueue, setPrintQueue] = useState([]);
  const [printing, setPrinting] = useState(null);

  // Force a re-render every 30s so the "X min ago" / delayed styling stays
  // live even when no new ticket data arrives.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(
    () => tickets.filter((t) => t.status === 'active').sort((a, b) => a.firedAt - b.firedAt),
    [tickets]
  );
  const ready = useMemo(
    () => tickets.filter((t) => t.status === 'ready').sort((a, b) => a.firedAt - b.firedAt),
    [tickets]
  );
  const delayedCount = active.filter((t) => elapsedMinutes(t.firedAt) >= DELAY_MINUTES).length;
  const cancelled = useMemo(() => tickets.filter((t) => t.status === 'cancelled'), [tickets]);

  function markReady(ticket) {
    setTickets(tickets.map((t) => (t.id === ticket.id ? { ...t, status: 'ready' } : t)));
  }
  function markServed(ticket) {
    setTickets(tickets.map((t) => (t.id === ticket.id ? { ...t, status: 'served' } : t)));
  }
  function acknowledgeCancel(ticket) {
    setTickets(tickets.map((t) => (t.id === ticket.id ? { ...t, status: 'acknowledged' } : t)));
  }

  // Auto-print: a dedicated station device (not "All") prints every new
  // active ticket for its station the moment it arrives - matches how the
  // real kitchen/bristo printers at Sabor work, no one has to click print.
  // Browsers still show the print dialog unless this device's browser was
  // launched with a kiosk-printing flag pointed at its default printer
  // (a one-time setup per device, not something the web app can control).
  // Right after switching this device's station (or on first load), don't
  // retroactively print whatever's already sitting on the board - only
  // tickets that arrive from this point on should auto-print.
  const stationRef = useRef(stationFilter);
  const baselineNextRef = useRef(true);
  useEffect(() => {
    if (stationRef.current !== stationFilter) {
      stationRef.current = stationFilter;
      baselineNextRef.current = true;
    }
  }, [stationFilter]);

  useEffect(() => {
    // Wait for the real fetch to land - `tickets` (and so `active`) starts
    // out empty before Supabase responds, and that empty snapshot must
    // never be allowed to consume the baseline-skip below.
    if (!loaded) return;
    if (stationFilter === 'all') return;
    const printedSet = new Set(printedIds);
    const matching = active.filter((t) => (t.items || []).some((i) => (i.station || 'kitchen') === stationFilter));
    const pending = matching.filter((t) => !printedSet.has(t.id));
    if (baselineNextRef.current) {
      baselineNextRef.current = false;
      if (pending.length) setPrintedIds((prev) => Array.from(new Set([...prev, ...pending.map((t) => t.id)])));
      return;
    }
    if (pending.length === 0) return;
    setPrintQueue((q) => {
      const existing = new Set(q.map((t) => t.id));
      const toAdd = pending.filter((t) => !existing.has(t.id));
      return toAdd.length ? [...q, ...toAdd] : q;
    });
  }, [active, stationFilter, printedIds, loaded]);

  useEffect(() => {
    if (!printing && printQueue.length > 0) {
      setPrinting(printQueue[0]);
      setPrintQueue((q) => q.slice(1));
    }
  }, [printQueue, printing]);

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => window.print(), 300); // let the print area paint first
    function afterPrint() {
      setPrintedIds((prev) => [...prev.slice(-500), printing.id]);
      setPrinting(null);
    }
    window.addEventListener('afterprint', afterPrint);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', afterPrint); };
  }, [printing]);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="text-lg font-bold m-0">Kitchen Display</h2>
        <div className="flex gap-2.5">
          <div className="bg-surface border border-border rounded-lg px-3 py-2">
            <span className="block text-[0.72rem] text-muted uppercase">Active KOTs</span>
            <span className="font-bold">{active.length}</span>
          </div>
          {delayedCount > 0 && (
            <div className="bg-bad/10 border border-bad rounded-lg px-3 py-2">
              <span className="block text-[0.72rem] text-bad uppercase">Delayed (&gt;{DELAY_MINUTES} min)</span>
              <span className="font-bold text-bad">{delayedCount}</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-muted text-sm -mt-2 mb-3">Billing tab se "Send to Kitchen" karte hi order yahan live aa jaata hai — kisi bhi device pe khula rakh sakte hain (kitchen ka tablet/monitor).</p>

      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-xs text-muted font-semibold">Ye device kis station ka hai:</span>
        {STATIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setStationFilter(s.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${stationFilter === s.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-muted'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {stationFilter !== 'all' && (
        <p className="text-muted text-xs mb-4">Naya ticket aate hi ye device khud print karega — printer connect hona chahiye is device se.</p>
      )}
      {stationFilter === 'all' && <div className="mb-4" />}

      {cancelled.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-sm text-bad uppercase tracking-wide mb-2.5">⚠ Cancelled Items</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {cancelled.map((t) => (
              <div key={t.id} className="rounded-xl border-2 border-bad bg-bad/10 p-3.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{t.table}</span>
                  <span className="px-2 py-0.5 rounded-full bg-bad text-white text-xs font-bold">CANCELLED</span>
                </div>
                {(t.items || []).map((item, idx) => (
                  <div key={idx} className="text-sm flex justify-between"><span>{item.name}</span><span className="font-bold">x{item.qty}</span></div>
                ))}
                <button onClick={() => acknowledgeCancel(t)} className="mt-1 py-1.5 rounded-md text-xs font-semibold bg-bad text-white hover:opacity-90">Acknowledge</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loaded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          <SkeletonCards count={4} />
        </div>
      )}

      {loaded && (
        <>
          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2.5">Cooking ({active.length})</h3>
          {active.length === 0 ? (
            <p className="text-muted text-sm bg-bg border border-border rounded-lg p-4 mb-5">Koi active KOT nahi hai abhi.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 mb-6">
              {active.map((t) => <TicketCard key={t.id} ticket={t} onMarkReady={markReady} onMarkServed={markServed} onPrint={setPrinting} stationFilter={stationFilter} />)}
            </div>
          )}

          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2.5">Ready for Pickup ({ready.length})</h3>
          {ready.length === 0 ? (
            <p className="text-muted text-sm bg-bg border border-border rounded-lg p-4">Koi ticket ready nahi hai abhi.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {ready.map((t) => <TicketCard key={t.id} ticket={t} onMarkReady={markReady} onMarkServed={markServed} onPrint={setPrinting} stationFilter={stationFilter} />)}
            </div>
          )}
        </>
      )}

      <Modal open={!!printing} onClose={() => setPrinting(null)} printArea>
        {printing && (
          <div className="font-mono text-sm">
            <div className="text-center font-bold text-base mb-1">KITCHEN ORDER TICKET</div>
            <div className="text-center text-xs text-muted mb-2.5">
              {new Date(printing.firedAt).toLocaleString('en-IN')}<br />
              {printing.billerName && <>Biller: {printing.billerName}{printing.billerRole ? ` (${roleLabel(printing.billerRole)})` : ''}<br /></>}
              Dine In &bull; Table No: {printing.table}
            </div>
            <hr className="border-dashed my-2" />
            {(printing.items || []).map((i, idx) => (
              <div key={idx} className="mb-1">
                <div className="flex justify-between font-semibold">
                  <span>{i.name}</span><span>x{i.qty}</span>
                </div>
                {i.note && <div className="text-xs italic">Special Note: {i.note}</div>}
              </div>
            ))}
            <hr className="border-dashed my-2" />
          </div>
        )}
        <ModalActions>
          <Btn variant="primary" onClick={() => window.print()}>Print</Btn>
          <Btn onClick={() => setPrinting(null)}>Close</Btn>
        </ModalActions>
      </Modal>
    </section>
  );
}
