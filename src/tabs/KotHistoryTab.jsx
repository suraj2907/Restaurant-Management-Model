import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { roleLabel, todayStr } from '../lib/store.js';
import { enqueueReprintJob, PRINTER_KITCHEN, PRINTER_DCR3 } from '../lib/printJobs.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
import { VegMark } from '../components/Icons.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';
import ReprintAuthorization from '../components/ReprintAuthorization.jsx';

const STATUS_FILTERS = ['all', 'active', 'ready', 'served', 'cancelled'];
const STATUS_LABEL = { active: 'Active', ready: 'Ready', served: 'Served', cancelled: 'Cancelled', acknowledged: 'Cancelled' };
const STATUS_STYLE = {
  active: 'bg-pending/15 text-pending-text',
  ready: 'bg-accent/15 text-accent-dark',
  served: 'bg-good/15 text-good',
  cancelled: 'bg-bad/15 text-bad',
  acknowledged: 'bg-bad/15 text-bad'
};

// KOT tickets are never deleted (see supabase-schema.sql / completeBill()
// in BillingTab) - this is the permanent, filterable record of every KOT
// ever fired, independent of KitchenDisplayTab's live cooking/ready board.
export default function KotHistoryTab({ profile }) {
  const canReprint = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [tickets, , loaded] = useSupabaseTable('kot_tickets', []);
  const [tableFilter, setTableFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);
  const [reprintFor, setReprintFor] = useState(null);
  const [reprintStatus, setReprintStatus] = useState(null); // { kotId, message } after queueing

  const tableOptions = useMemo(() => [...new Set(tickets.map((t) => t.table))].sort(), [tickets]);

  const rows = useMemo(() => {
    const start = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : 0;
    const end = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity;
    const q = search.trim().toLowerCase();
    return tickets
      .filter((t) => t.firedAt >= start && t.firedAt <= end)
      .filter((t) => !tableFilter || t.table === tableFilter)
      .filter((t) => statusFilter === 'all' || t.status === statusFilter || (statusFilter === 'cancelled' && t.status === 'acknowledged'))
      .filter((t) => !q || String(t.orderNo || '').includes(q) || (t.table || '').toLowerCase().includes(q) || (t.billerName || '').toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
      .sort((a, b) => b.firedAt - a.firedAt);
  }, [tickets, tableFilter, statusFilter, fromDate, toDate, search]);

  async function doReprint(kot) {
    setReprintStatus(null);
    const items = kot.items || [];
    const kitchenItems = items.filter((i) => (i.station || 'kitchen') === 'kitchen');
    const bristoItems = items.filter((i) => i.station === 'bristo');
    const payloadBase = { kotId: kot.id, orderNo: kot.orderNo, table: kot.table, billerName: kot.billerName, billerRole: kot.billerRole, isReprint: true };
    const queued = [];
    try {
      if (kitchenItems.length) {
        await enqueueReprintJob({ referenceId: kot.id, printType: 'kot_kitchen', station: 'kitchen', printerId: PRINTER_KITCHEN, payload: { ...payloadBase, items: kitchenItems }, tableName: kot.table, orderNo: kot.orderNo });
        queued.push('Kitchen');
      }
      if (bristoItems.length) {
        await enqueueReprintJob({ referenceId: kot.id, printType: 'kot_bristo', station: 'bristo', printerId: PRINTER_DCR3, payload: { ...payloadBase, items: bristoItems }, tableName: kot.table, orderNo: kot.orderNo });
        queued.push('Bristo');
      }
      setReprintStatus({ kotId: kot.id, message: `Reprint queued (${queued.join(' + ')}).`, ok: true });
    } catch (err) {
      setReprintStatus({ kotId: kot.id, message: err.message || 'Reprint queue nahi ho paya.', ok: false });
    }
    setReprintFor(null);
  }

  return (
    <section>
      <h2 className="text-lg font-bold mb-1">KOT History</h2>
      <p className="text-muted text-sm mb-3.5">Har fire hui KOT hamesha ke liye yahan record rehti hai — bill complete hone ke baad bhi.</p>

      <div className="flex items-center gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="">All Tables</option>
          {tableOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex items-center gap-1.5 text-sm">
          <input type="date" value={fromDate} max={toDate || todayStr()} onChange={(e) => setFromDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-sm" />
          <span className="text-muted text-xs">to</span>
          <input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-sm" />
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="KOT / Table / Biller se search..." className="px-2.5 py-1.5 border border-border rounded-md text-sm flex-1 min-w-[160px]" />
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border ${statusFilter === s ? 'bg-accent text-white border-accent' : 'bg-bg border-border text-muted'}`}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <TableScroll>
        <DataTable columns={['KOT', 'Table', 'Time', 'Biller', 'Items', 'Status', 'Actions']}>
          {!loaded && <SkeletonRows rows={5} cols={7} />}
          {loaded && rows.length === 0 && <EmptyRow span={7}>Is filter mein koi KOT nahi mila.</EmptyRow>}
          {rows.map((kot) => (
            <tr key={kot.id}>
              <td className={td}>{kot.orderNo ? `#${kot.orderNo}` : kot.id.slice(-6)}</td>
              <td className={td}>{kot.table}</td>
              <td className={td}>{new Date(kot.firedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td className={td}>{kot.billerName || '-'}{kot.billerRole ? ` (${roleLabel(kot.billerRole)})` : ''}</td>
              <td className={td}>{(kot.items || []).length} item(s){kot.isReorder ? ' • Add-on' : ''}</td>
              <td className={td}>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${STATUS_STYLE[kot.status] || 'bg-well text-muted'}`}>
                  {STATUS_LABEL[kot.status] || kot.status}
                </span>
              </td>
              <td className={`${td} space-x-2`}>
                <button onClick={() => setViewing(kot)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border hover:text-ink">View</button>
                {canReprint && (
                  <button onClick={() => { setReprintFor(kot); setReprintStatus(null); }} className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bad/10 text-bad hover:bg-bad/20">Reprint</button>
                )}
                {reprintStatus?.kotId === kot.id && (
                  <div className={`text-xs font-semibold mt-1 ${reprintStatus.ok ? 'text-good' : 'text-bad'}`}>{reprintStatus.message}</div>
                )}
                {reprintFor?.id === kot.id && (
                  <ReprintAuthorization
                    open
                    title={`Reprint KOT ${kot.orderNo ? '#' + kot.orderNo : ''} — ${kot.table}`}
                    onCancel={() => setReprintFor(null)}
                    onAuthorized={() => doReprint(kot)}
                  />
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `KOT ${viewing.orderNo ? '#' + viewing.orderNo : viewing.id.slice(-6)}` : ''}>
        {viewing && (
          <div className="text-sm">
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div><span className="text-muted">Table:</span> <span className="font-semibold">{viewing.table}</span></div>
              <div><span className="text-muted">Status:</span> <span className="font-semibold">{STATUS_LABEL[viewing.status] || viewing.status}</span></div>
              <div><span className="text-muted">Biller:</span> <span className="font-semibold">{viewing.billerName || '-'}{viewing.billerRole ? ` (${roleLabel(viewing.billerRole)})` : ''}</span></div>
              <div><span className="text-muted">Time:</span> <span className="font-semibold">{new Date(viewing.firedAt).toLocaleString('en-IN')}</span></div>
              {viewing.isReorder && <div className="col-span-2 text-secondary-dark font-semibold">Reorder / Add-on</div>}
            </div>
            <hr className="border-dashed my-2" />
            {(viewing.items || []).map((item, idx) => (
              <div key={idx} className="py-1.5 border-b border-border last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <VegMark veg={item.veg !== false} />
                    {item.name}
                    <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-well text-muted uppercase font-bold">{item.station || 'kitchen'}</span>
                  </span>
                  <span className="font-bold">x{item.qty}</span>
                </div>
                {item.note && <div className="text-xs italic text-muted mt-0.5">{item.note}</div>}
              </div>
            ))}
          </div>
        )}
        <ModalActions>
          <Btn onClick={() => setViewing(null)}>Close</Btn>
        </ModalActions>
      </Modal>
    </section>
  );
}
