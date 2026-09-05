import { useEffect, useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { rupee } from '../lib/store.js';
import { SkeletonCards } from '../components/Skeleton.jsx';
import { VegMark } from '../components/Icons.jsx';

const DELAY_MINUTES = 15;

function elapsedMinutes(firedAt) {
  return Math.floor((Date.now() - firedAt) / 60000);
}

function TicketCard({ ticket, onMarkReady, onMarkServed }) {
  const mins = elapsedMinutes(ticket.firedAt);
  const delayed = mins >= DELAY_MINUTES && ticket.status === 'active';
  return (
    <div className={`rounded-xl border p-3.5 shadow-card flex flex-col gap-2.5 ${delayed ? 'bg-bad/5 border-bad' : 'bg-surface border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-headline-sm text-lg">{ticket.tableName}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${delayed ? 'bg-bad text-white animate-pulse' : 'bg-well text-muted'}`}>
          {mins <= 0 ? 'Just now' : `${mins} min ago`}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {(ticket.items || []).map((item, idx) => (
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

export default function KitchenDisplayTab() {
  const [tickets, setTickets, loaded] = useSupabaseTable('kot_tickets', []);
  const [, setTick] = useState(0);

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

  function markReady(ticket) {
    setTickets(tickets.map((t) => (t.id === ticket.id ? { ...t, status: 'ready' } : t)));
  }
  function markServed(ticket) {
    setTickets(tickets.map((t) => (t.id === ticket.id ? { ...t, status: 'served' } : t)));
  }

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
      <p className="text-muted text-sm -mt-2 mb-4">Billing tab se "Send to Kitchen" karte hi order yahan live aa jaata hai — kisi bhi device pe khula rakh sakte hain (kitchen ka tablet/monitor).</p>

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
              {active.map((t) => <TicketCard key={t.id} ticket={t} onMarkReady={markReady} onMarkServed={markServed} />)}
            </div>
          )}

          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2.5">Ready for Pickup ({ready.length})</h3>
          {ready.length === 0 ? (
            <p className="text-muted text-sm bg-bg border border-border rounded-lg p-4">Koi ticket ready nahi hai abhi.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {ready.map((t) => <TicketCard key={t.id} ticket={t} onMarkReady={markReady} onMarkServed={markServed} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
