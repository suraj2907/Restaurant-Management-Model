import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { rupee, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' }
];

function rangeStart(range) {
  const now = new Date();
  if (range === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (range === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return 0;
}

// Order-by-order sales ledger, matching the granularity of a typical POS
// "Sales Report" screen (order no, payment type, tax split, biller) -
// aggregate breakdowns (top items, by category/table/captain, peak hours)
// live on the Dashboard tab instead.
export default function ReportsTab() {
  const [bills, , billsLoaded] = useSupabaseTable('bills', []);
  const [range, setRange] = useState('week');
  const [search, setSearch] = useState('');
  // Picking an exact from/to date overrides the preset range buttons above -
  // selecting a preset clears these back out so only one mode is active.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  function selectPreset(id) {
    setRange(id);
    setFromDate('');
    setToDate('');
  }

  const { rows, totals } = useMemo(() => {
    const start = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : rangeStart(range);
    const end = toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity;
    const q = search.trim().toLowerCase();
    const rows = bills
      .filter((b) => b.ts >= start && b.ts <= end)
      .filter((b) => !q || String(b.orderNo || '').includes(q) || (b.table || '').toLowerCase().includes(q) || (b.billedBy || '').toLowerCase().includes(q))
      .sort((a, b) => b.ts - a.ts);

    const totals = rows.reduce(
      (t, b) => ({
        subtotal: t.subtotal + b.subtotal,
        discount: t.discount + (b.discount || 0),
        deliveryCharge: t.deliveryCharge + (b.deliveryCharge || 0),
        containerCharge: t.containerCharge + (b.containerCharge || 0),
        serviceCharge: t.serviceCharge + (b.serviceCharge || 0),
        cgst: t.cgst + b.gst / 2,
        sgst: t.sgst + b.gst / 2,
        waivedOff: t.waivedOff + (b.waivedOff || 0),
        total: t.total + b.total
      }),
      { subtotal: 0, discount: 0, deliveryCharge: 0, containerCharge: 0, serviceCharge: 0, cgst: 0, sgst: 0, waivedOff: 0, total: 0 }
    );

    return { rows, totals };
  }, [bills, range, fromDate, toDate, search]);

  function exportReport() {
    const sheet = XLSX.utils.json_to_sheet(rows.map((b) => ({
      'Order No.': b.orderNo || '',
      Date: new Date(b.ts).toLocaleDateString('en-IN'),
      Table: b.table,
      'Payment Type': b.payment,
      Amount: b.subtotal,
      Discount: b.discount || 0,
      'Delivery Charge': b.deliveryCharge || 0,
      'Container Charge': b.containerCharge || 0,
      'Service Charge': b.serviceCharge || 0,
      CGST: b.gst / 2,
      SGST: b.gst / 2,
      'Waived Off': b.waivedOff || 0,
      Total: b.total,
      'Billed By': b.billedBy || ''
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sales Report');
    XLSX.writeFile(wb, `sales-report-${todayStr()}.xlsx`);
  }

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2.5 mb-4">
        <h2 className="text-lg font-bold m-0">Reports</h2>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => selectPreset(r.id)} className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border ${!fromDate && !toDate && range === r.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <input type="date" value={fromDate} max={toDate || todayStr()} onChange={(e) => setFromDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-xs sm:text-sm" />
            <span className="text-muted text-xs">to</span>
            <input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-xs sm:text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-2.5 mb-3">
          <h3 className="font-bold m-0">Sales Report</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order no, table ya biller se search karein..."
              className="px-2.5 py-1.5 border border-border rounded-md text-sm w-full sm:w-64"
            />
            <button onClick={exportReport} disabled={rows.length === 0} className="px-3 py-1.5 rounded-md text-sm font-semibold bg-good text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
              Export Excel
            </button>
          </div>
        </div>
        <TableScroll>
          <DataTable columns={['Order No.', 'Date', 'Table', 'Payment Type', 'Amount', 'Discount', 'Delivery Charge', 'Container Charge', 'Service Charge', 'CGST', 'SGST', 'Waived Off', 'Total', 'Billed By']}>
            {!billsLoaded && <SkeletonRows rows={5} cols={14} />}
            {billsLoaded && rows.length === 0 && <EmptyRow span={14}>Is range mein koi bill nahi hai.</EmptyRow>}
            {billsLoaded && rows.length > 0 && (
              <tr className="bg-well/60 font-bold">
                <td className={td}>Total</td>
                <td className={td}>-</td>
                <td className={td}>-</td>
                <td className={td}>-</td>
                <td className={td}>{rupee(totals.subtotal)}</td>
                <td className={td}>{rupee(totals.discount)}</td>
                <td className={td}>{rupee(totals.deliveryCharge)}</td>
                <td className={td}>{rupee(totals.containerCharge)}</td>
                <td className={td}>{rupee(totals.serviceCharge)}</td>
                <td className={td}>{rupee(totals.cgst)}</td>
                <td className={td}>{rupee(totals.sgst)}</td>
                <td className={td}>{rupee(totals.waivedOff)}</td>
                <td className={td}>{rupee(totals.total)}</td>
                <td className={td}>-</td>
              </tr>
            )}
            {rows.map((b) => (
              <tr key={b.id}>
                <td className={td}>{b.orderNo || '-'}</td>
                <td className={td}>{new Date(b.ts).toLocaleDateString('en-IN')}</td>
                <td className={td}>{b.table}</td>
                <td className={td}>{b.payment}</td>
                <td className={td}>{rupee(b.subtotal)}</td>
                <td className={td}>{b.discount > 0 ? rupee(b.discount) : '-'}</td>
                <td className={td}>{b.deliveryCharge > 0 ? rupee(b.deliveryCharge) : '-'}</td>
                <td className={td}>{b.containerCharge > 0 ? rupee(b.containerCharge) : '-'}</td>
                <td className={td}>{b.serviceCharge > 0 ? rupee(b.serviceCharge) : '-'}</td>
                <td className={td}>{rupee(b.gst / 2)}</td>
                <td className={td}>{rupee(b.gst / 2)}</td>
                <td className={td}>{b.waivedOff > 0 ? rupee(b.waivedOff) : '-'}</td>
                <td className={`${td} font-semibold`}>{rupee(b.total)}</td>
                <td className={td}>{b.billedBy || '-'}</td>
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      </div>
    </section>
  );
}
