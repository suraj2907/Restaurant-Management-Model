import { useMemo, useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { SkeletonCards } from '../components/Skeleton.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

const STATUS_STYLE = {
  upcoming: 'bg-accent/10 text-accent-dark',
  waitlist: 'bg-secondary/15 text-secondary-dark',
  seated: 'bg-good/15 text-good',
  completed: 'bg-border/60 text-muted',
  cancelled: 'bg-bad/10 text-bad'
};

export default function ReservationsTab() {
  const [reservations, setReservations, loaded] = useSupabaseTable('reservations', []);
  const [tables] = useLocalState('rm_tables', []);
  const [filter, setFilter] = useState('upcoming');
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  function addReservation(e) {
    e.preventDefault();
    const f = e.target;
    setReservations([
      ...reservations,
      {
        id: uid(),
        name: f.name.value.trim(),
        phone: f.phone.value.trim(),
        date: f.date.value,
        time: f.time.value,
        partySize: parseInt(f.partySize.value, 10) || 1,
        table: f.table.value,
        note: f.note.value.trim(),
        advanceAmount: parseFloat(f.advanceAmount.value) || 0,
        status: 'upcoming',
        createdAt: Date.now()
      }
    ]);
    f.reset();
    f.date.value = todayStr();
  }

  function addWaitlist(e) {
    e.preventDefault();
    const f = e.target;
    setReservations([
      ...reservations,
      {
        id: uid(),
        name: f.name.value.trim(),
        phone: f.phone.value.trim(),
        date: todayStr(),
        time: new Date().toTimeString().slice(0, 5),
        partySize: parseInt(f.partySize.value, 10) || 1,
        table: '',
        note: f.note.value.trim(),
        advanceAmount: 0,
        status: 'waitlist',
        createdAt: Date.now()
      }
    ]);
    setWaitlistOpen(false);
  }

  function setStatus(id, status) {
    setReservations(reservations.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  const waitlistCount = useMemo(() => reservations.filter((r) => r.status === 'waitlist').length, [reservations]);

  const filtered = useMemo(() => {
    const sorted = reservations.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const today = todayStr();
    return sorted.filter((r) => {
      if (filter === 'today') return r.date === today;
      if (filter === 'upcoming') return r.status === 'upcoming';
      if (filter === 'waitlist') return r.status === 'waitlist';
      return true;
    });
  }, [reservations, filter]);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
        <h2 className="text-lg font-bold m-0">Table Reservations &amp; Waitlist</h2>
        <button
          onClick={() => setWaitlistOpen(true)}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-secondary text-white hover:bg-secondary-dark"
        >
          + Add to Waitlist
        </button>
      </div>
      <form onSubmit={addReservation} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Customer name" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="phone" required placeholder="Phone" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="date" type="date" defaultValue={todayStr()} required className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="time" type="time" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="partySize" type="number" min="1" defaultValue="2" placeholder="Guests" className="px-2.5 py-2 border border-border rounded-md text-sm w-24" />
        <select name="table" defaultValue="" className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="">Koi bhi table</option>
          {tables.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input name="advanceAmount" type="number" step="0.01" placeholder="Advance/token (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm w-44" />
        <input name="note" placeholder="Note (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Reservation</button>
      </form>

      <div className="flex gap-1.5 mb-3.5 flex-wrap">
        {[
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'waitlist', label: `Waitlist${waitlistCount ? ` (${waitlistCount})` : ''}` },
          { id: 'today', label: 'Today' },
          { id: 'all', label: 'All' }
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border ${filter === f.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {!loaded && <SkeletonCards count={4} />}
        {loaded && filtered.length === 0 && <p className="text-muted text-sm col-span-full">Koi reservation nahi hai.</p>}
        {loaded && filtered.map((r) => (
          <div key={r.id} className={`bg-surface border rounded-xl p-3.5 shadow-card flex flex-col gap-2.5 ${r.status === 'waitlist' ? 'border-secondary' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-bold text-sm block">{r.name}</span>
                <span className="text-xs text-muted">{r.phone}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-well/60 rounded-lg p-2 text-center">
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Date/Time</span>
                <span className="font-bold text-xs">{r.date === todayStr() ? 'Today' : r.date} {r.time}</span>
              </div>
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Guests</span>
                <span className="font-bold text-sm">{r.partySize}</span>
              </div>
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Table</span>
                <span className="font-bold text-sm">{r.table || 'Any'}</span>
              </div>
            </div>

            {r.advanceAmount > 0 && (
              <div className="bg-secondary/10 border border-secondary/30 rounded-lg p-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-secondary-dark">Advance Token</span>
                <span className="font-bold text-secondary-dark">{rupee(r.advanceAmount)}</span>
              </div>
            )}
            {r.note && <p className="text-xs text-muted italic bg-bg rounded-lg p-2">"{r.note}"</p>}

            <div className="flex gap-1.5 flex-wrap">
              {(r.status === 'upcoming' || r.status === 'waitlist') && (
                <>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setReservations(reservations.map((x) => (x.id === r.id ? { ...x, table: e.target.value, status: 'seated' } : x)));
                    }}
                    className="flex-1 min-w-[100px] px-2 py-1.5 rounded-md text-xs font-semibold bg-good text-white border-0"
                  >
                    <option value="">Seat at...</option>
                    {tables.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setStatus(r.id, 'cancelled')}>Cancel</button>
                </>
              )}
              {r.status === 'seated' && (
                <button className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setStatus(r.id, 'completed')}>Mark Completed</button>
              )}
              <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-bad border border-bad/30 hover:bg-bad/5" onClick={() => setReservations(reservations.filter((x) => x.id !== r.id))}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={waitlistOpen} onClose={() => setWaitlistOpen(false)} title="Add to Waitlist">
        <p className="text-muted text-xs -mt-1 mb-3">Walk-in guest jinke liye abhi table available nahi hai — table free hote hi "Seat at" se assign kar dena.</p>
        <form onSubmit={addWaitlist}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Guest name</label>
            <input name="name" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Phone</label>
            <input name="phone" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Guests</label>
            <input name="partySize" type="number" min="1" defaultValue="2" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. Waiting near entrance" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Add to Waitlist</Btn>
            <Btn type="button" onClick={() => setWaitlistOpen(false)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>
    </section>
  );
}
