import { useMemo, useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
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

      <TableScroll>
        <DataTable columns={['Date', 'Time', 'Name', 'Phone', 'Guests', 'Table', 'Advance', 'Status', 'Actions']}>
          {!loaded && <SkeletonRows rows={4} cols={9} />}
          {loaded && filtered.length === 0 && <EmptyRow span={9}>Koi reservation nahi hai.</EmptyRow>}
          {loaded && filtered.map((r) => (
            <tr key={r.id}>
              <td className={td}>{r.date}</td>
              <td className={td}>{r.time}</td>
              <td className={td}>{r.name}</td>
              <td className={td}>{r.phone}</td>
              <td className={td}>{r.partySize}</td>
              <td className={td}>{r.table || 'Koi bhi'}</td>
              <td className={td}>{r.advanceAmount > 0 ? rupee(r.advanceAmount) : '-'}</td>
              <td className={td}>
                <span className={`px-2 py-1 rounded-md text-xs font-semibold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </td>
              <td className={`${td} space-x-2 whitespace-nowrap`}>
                {(r.status === 'upcoming' || r.status === 'waitlist') && (
                  <>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setReservations(reservations.map((x) => (x.id === r.id ? { ...x, table: e.target.value, status: 'seated' } : x)));
                      }}
                      className="px-2 py-1 rounded-md text-xs font-semibold bg-bg border border-border"
                    >
                      <option value="">Seat at...</option>
                      {tables.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="px-2.5 py-1 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setStatus(r.id, 'cancelled')}>Cancel</button>
                  </>
                )}
                {r.status === 'seated' && (
                  <button className="px-2.5 py-1 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setStatus(r.id, 'completed')}>Completed</button>
                )}
                <button className="text-bad underline text-sm" onClick={() => setReservations(reservations.filter((x) => x.id !== r.id))}>Remove</button>
              </td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>

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
