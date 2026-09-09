import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';

const PRINT_TYPE_LABEL = { kot_kitchen: 'Kitchen KOT', kot_bristo: 'Bristo KOT', bill: 'Bill', test: 'Test Print' };
const STATION_LABEL = { kitchen: 'Kitchen', bristo: 'Bristo', bistro_bill: 'Bristo / Bill' };
const STATUS_STYLE = { queued: 'bg-well text-muted', printing: 'bg-pending/15 text-pending-text', printed: 'bg-good/15 text-good', failed: 'bg-bad/15 text-bad' };

// Admin/Super Admin only (App.jsx gates the tab) - the permanent audit
// trail of every physical print attempt: who initiated it, when, what,
// which station/printer, and whether it was a normal print or a
// password-gated reprint. Rows come from print_history (written only by
// the enqueue_print_job/enqueue_reprint_job RPCs and updated by
// complete_print_job, never directly by the frontend).
export default function PrintHistoryTab() {
  const [history, , loaded] = useSupabaseTable('print_history', []);
  const [profiles] = useSupabaseTable('profiles', []);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [station, setStation] = useState('');
  const [printType, setPrintType] = useState('');
  const [reprintOnly, setReprintOnly] = useState(false);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const nameById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.name])), [profiles]);

  const rows = useMemo(() => {
    const start = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : 0;
    const end = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity;
    const q = search.trim().toLowerCase();
    return history
      .filter((h) => {
        const t = new Date(h.printedAt).getTime();
        return t >= start && t <= end;
      })
      .filter((h) => !station || h.station === station)
      .filter((h) => !printType || h.printType === printType)
      .filter((h) => !reprintOnly || h.isReprint)
      .filter((h) => !status || h.status === status)
      .filter((h) => !q || h.referenceId.toLowerCase().includes(q) || String(h.orderNo || '').includes(q) || (h.tableName || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.printedAt) - new Date(a.printedAt));
  }, [history, fromDate, toDate, station, printType, reprintOnly, status, search]);

  return (
    <section>
      <h2 className="text-lg font-bold mb-1">Print History</h2>
      <p className="text-muted text-sm mb-3.5">Har physical print attempt ka audit — kisne, kab, kya, kis station/printer par, normal ya reprint.</p>

      <div className="flex items-center gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <div className="flex items-center gap-1.5 text-sm">
          <input type="date" value={fromDate} max={toDate || todayStr()} onChange={(e) => setFromDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-sm" />
          <span className="text-muted text-xs">to</span>
          <input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-sm" />
        </div>
        <select value={station} onChange={(e) => setStation(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="">All Stations</option>
          <option value="kitchen">Kitchen</option>
          <option value="bristo">Bristo</option>
          <option value="bistro_bill">Bristo / Bill</option>
        </select>
        <select value={printType} onChange={(e) => setPrintType(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="">All Types</option>
          <option value="kot_kitchen">Kitchen KOT</option>
          <option value="kot_bristo">Bristo KOT</option>
          <option value="bill">Bill</option>
          <option value="test">Test Print</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="">All Status</option>
          <option value="queued">Queued</option>
          <option value="printing">Printing</option>
          <option value="printed">Printed</option>
          <option value="failed">Failed</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <input type="checkbox" checked={reprintOnly} onChange={(e) => setReprintOnly(e.target.checked)} className="w-3.5 h-3.5" />
          Reprint only
        </label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference / order / table search..." className="px-2.5 py-1.5 border border-border rounded-md text-sm flex-1 min-w-[160px]" />
      </div>

      <TableScroll>
        <DataTable columns={['Date/Time', 'Reference', 'Type', 'Station', 'Table', 'Normal/Reprint', 'Status', 'Printed By']}>
          {!loaded && <SkeletonRows rows={6} cols={8} />}
          {loaded && rows.length === 0 && <EmptyRow span={8}>Is filter mein koi print record nahi mila.</EmptyRow>}
          {rows.map((h) => (
            <tr key={h.id}>
              <td className={td}>{new Date(h.printedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td className={td}>{h.orderNo ? `#${h.orderNo}` : h.referenceId.slice(-6)}</td>
              <td className={td}>{PRINT_TYPE_LABEL[h.printType] || h.printType}</td>
              <td className={td}>{STATION_LABEL[h.station] || h.station}</td>
              <td className={td}>{h.tableName || '-'}</td>
              <td className={td}>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${h.isReprint ? 'bg-bad/15 text-bad' : 'bg-well text-muted'}`}>
                  {h.isReprint ? 'Reprint' : 'Normal'}
                </span>
              </td>
              <td className={td}>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${STATUS_STYLE[h.status] || 'bg-well text-muted'}`}>{h.status}</span>
              </td>
              <td className={td}>{nameById[h.printedBy] || '-'}</td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>
    </section>
  );
}
