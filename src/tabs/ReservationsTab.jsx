import { useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';

const STATUS_STYLE = {
  upcoming: 'bg-accent/10 text-accent-dark',
  seated: 'bg-good/15 text-good',
  completed: 'bg-border/60 text-muted',
  cancelled: 'bg-bad/10 text-bad'
};

export default function ReservationsTab() {
  const [reservations, setReservations] = useSupabaseTable('reservations', []);
  const [tables] = useLocalState('rm_tables', []);
  const [filter, setFilter] = useState('upcoming');

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
        status: 'upcoming',
        createdAt: Date.now()
      }
    ]);
    f.reset();
    f.date.value = todayStr();
  }

  function setStatus(id, status) {
    setReservations(reservations.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  const sorted = reservations.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const today = todayStr();
  const filtered = sorted.filter((r) => {
    if (filter === 'today') return r.date === today;
    if (filter === 'upcoming') return r.status === 'upcoming';
    return true;
  });

  return (
    <section>
      <h2 className="text-lg font-bold mb-3.5">Table Reservations</h2>
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
        <input name="note" placeholder="Note (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Reservation</button>
      </form>

      <div className="flex gap-1.5 mb-3.5">
        {[
          { id: 'upcoming', label: 'Upcoming' },
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
        <DataTable columns={['Date', 'Time', 'Name', 'Phone', 'Guests', 'Table', 'Status', 'Actions']}>
          {filtered.length === 0 && <EmptyRow span={8}>Koi reservation nahi hai.</EmptyRow>}
          {filtered.map((r) => (
            <tr key={r.id}>
              <td className={td}>{r.date}</td>
              <td className={td}>{r.time}</td>
              <td className={td}>{r.name}</td>
              <td className={td}>{r.phone}</td>
              <td className={td}>{r.partySize}</td>
              <td className={td}>{r.table || 'Koi bhi'}</td>
              <td className={td}>
                <span className={`px-2 py-1 rounded-md text-xs font-semibold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </td>
              <td className={`${td} space-x-2`}>
                {r.status === 'upcoming' && (
                  <>
                    <button className="px-2.5 py-1 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setStatus(r.id, 'seated')}>Seated</button>
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
    </section>
  );
}
