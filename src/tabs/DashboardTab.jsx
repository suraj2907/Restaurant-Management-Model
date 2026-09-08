import { memo, useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { rupee } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonCards, SkeletonRows } from '../components/Skeleton.jsx';
import BarChart from '../components/BarChart.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';
import { ReceiptContent, downloadBill } from '../components/Receipt.jsx';

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

export default function DashboardTab({ restaurantName, restaurantDetails }) {
  const [bills, , billsLoaded] = useSupabaseTable('bills', []);
  const [expenses, , expensesLoaded] = useSupabaseTable('expenses', []);
  const [menu] = useSupabaseTable('menu', []);
  const [range, setRange] = useState('today');
  // Picking an exact from/to date overrides the preset range buttons -
  // selecting a preset clears these back out so only one mode is active
  // (same pattern as Reports' date range picker).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [receipt, setReceipt] = useState(null);
  const loaded = billsLoaded && expensesLoaded;

  function selectPreset(id) {
    setRange(id);
    setFromDate('');
    setToDate('');
  }

  const rangeBounds = useMemo(() => ({
    start: fromDate ? new Date(fromDate + 'T00:00:00').getTime() : rangeStart(range),
    end: toDate ? new Date(toDate + 'T23:59:59').getTime() : Infinity
  }), [range, fromDate, toDate]);

  // Sales breakdowns (top items, category, table, captain, peak hours) -
  // moved here from Reports, which now holds the order-by-order ledger
  // instead. Shares this same range picker rather than duplicating one.
  const { topItems, catSales, activeHours, hourLabels, hourValues, staffSales, tableSales } = useMemo(() => {
    const { start, end } = rangeBounds;
    const filtered = bills.filter((b) => b.ts >= start && b.ts <= end);

    const itemMap = {};
    filtered.forEach((b) => b.items.forEach((i) => {
      if (!itemMap[i.name]) itemMap[i.name] = { name: i.name, qty: 0, revenue: 0 };
      itemMap[i.name].qty += i.qty;
      itemMap[i.name].revenue += i.qty * i.price;
    }));
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const categoryOf = {};
    menu.forEach((m) => { categoryOf[m.name] = m.category; });
    const catMap = {};
    filtered.forEach((b) => b.items.forEach((i) => {
      const cat = categoryOf[i.name] || 'Uncategorized';
      if (!catMap[cat]) catMap[cat] = { category: cat, revenue: 0 };
      catMap[cat].revenue += i.qty * i.price;
    }));
    const catSales = Object.values(catMap).sort((a, b) => b.revenue - a.revenue);

    const hourRevenue = Array(24).fill(0);
    filtered.forEach((b) => { const h = new Date(b.ts).getHours(); hourRevenue[h] += b.total; });
    const activeHours = hourRevenue.map((v, h) => ({ h, v })).filter((x) => x.v > 0);
    const hourLabels = activeHours.map((x) => `${x.h}:00`);
    const hourValues = activeHours.map((x) => x.v);

    const staffMap = {};
    filtered.forEach((b) => {
      const key = b.staffName || 'Not specified';
      if (!staffMap[key]) staffMap[key] = { name: key, revenue: 0, bills: 0 };
      staffMap[key].revenue += b.total;
      staffMap[key].bills += 1;
    });
    const staffSales = Object.values(staffMap).sort((a, b) => b.revenue - a.revenue);

    const tableMap = {};
    filtered.forEach((b) => {
      if (!tableMap[b.table]) tableMap[b.table] = { table: b.table, revenue: 0, bills: 0 };
      tableMap[b.table].revenue += b.total;
      tableMap[b.table].bills += 1;
    });
    const tableSales = Object.values(tableMap).sort((a, b) => b.revenue - a.revenue);

    return { topItems, catSales, activeHours, hourLabels, hourValues, staffSales, tableSales };
  }, [bills, menu, rangeBounds]);

  // These reduce/sort/filter passes are cheap individually but bills/expenses
  // can grow into the thousands over a year - recomputing all of them (plus
  // rebuilding the chart's series arrays) on every keystroke-level re-render
  // elsewhere in the tree is wasted work, so only redo it when the source
  // data or the selected range actually changes.
  const stats = useMemo(() => {
    const { start, end } = rangeBounds;
    const filteredBills = bills.filter((b) => b.ts >= start && b.ts <= end);
    const filteredExp = expenses.filter((x) => { const t = new Date(x.date + 'T00:00:00').getTime(); return t >= start && t <= end; });
    const revenue = filteredBills.reduce((s, b) => s + b.total, 0);
    const expTotal = filteredExp.reduce((s, x) => s + x.amount, 0);
    return { revenue, expTotal, profit: revenue - expTotal, billCount: filteredBills.length };
  }, [bills, expenses, rangeBounds]);

  const chart = useMemo(() => {
    const days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
    const dayLabels = days.map((d) => d.toLocaleDateString('en-IN', { weekday: 'short' }));
    const dayRev = days.map((d) => {
      const next = d.getTime() + 86400000;
      return bills.filter((b) => b.ts >= d.getTime() && b.ts < next).reduce((s, b) => s + b.total, 0);
    });
    const dayExp = days.map((d) => {
      const next = d.getTime() + 86400000;
      return expenses.filter((x) => { const t = new Date(x.date + 'T00:00:00').getTime(); return t >= d.getTime() && t < next; }).reduce((s, x) => s + x.amount, 0);
    });
    return {
      labels: dayLabels,
      series: [
        { name: 'Revenue', color: '#3f7d47', values: dayRev },
        { name: 'Expense', color: '#b23b3b', values: dayExp }
      ]
    };
  }, [bills, expenses]);

  const recentBills = useMemo(() => bills.slice().sort((a, b) => b.ts - a.ts).slice(0, 8), [bills]);
  const recentExp = useMemo(() => expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [expenses]);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2.5 mb-3.5">
        <h2 className="text-lg font-bold m-0">Profit &amp; Loss Dashboard</h2>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button key={r.id} onClick={() => selectPreset(r.id)} className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border ${!fromDate && !toDate && range === r.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-xs sm:text-sm" />
            <span className="text-muted text-xs">to</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-xs sm:text-sm" />
          </div>
        </div>
      </div>

      {!loaded ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6"><SkeletonCards count={4} /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          <Card label="Revenue" value={rupee(stats.revenue)} color="text-good" />
          <Card label="Expenses" value={rupee(stats.expTotal)} color="text-bad" />
          <Card label="Profit / Loss" value={rupee(stats.profit)} color={stats.profit >= 0 ? 'text-good' : 'text-bad'} />
          <Card label="Bills Generated" value={stats.billCount} />
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg p-4 mb-6">
        <h3 className="font-bold mb-1">Revenue vs Expense (last 7 days)</h3>
        <BarChart labels={chart.labels} valueFmt={rupee} series={chart.series} />
      </div>

      {activeHours.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-6">
          <h3 className="font-bold mt-0 mb-1">Peak Hours (revenue by hour)</h3>
          <BarChart labels={hourLabels} valueFmt={rupee} series={[{ name: 'Revenue', color: '#b5541a', values: hourValues }]} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-2.5">Top Selling Items</h3>
          <TableScroll>
            <DataTable columns={['Item', 'Qty Sold', 'Revenue']}>
              {!loaded && <SkeletonRows rows={3} cols={3} />}
              {loaded && topItems.length === 0 && <EmptyRow span={3}>Koi data nahi hai.</EmptyRow>}
              {topItems.map((i) => (
                <tr key={i.name}>
                  <td className={td}>{i.name}</td>
                  <td className={td}>{i.qty}</td>
                  <td className={td}>{rupee(i.revenue)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-2.5">Sales by Category</h3>
          <TableScroll>
            <DataTable columns={['Category', 'Revenue']}>
              {!loaded && <SkeletonRows rows={3} cols={2} />}
              {loaded && catSales.length === 0 && <EmptyRow span={2}>Koi data nahi hai.</EmptyRow>}
              {catSales.map((c) => (
                <tr key={c.category}>
                  <td className={td}>{c.category}</td>
                  <td className={td}>{rupee(c.revenue)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-2.5">Sales by Table</h3>
          <p className="text-muted text-sm -mt-1 mb-2.5">Is date range mein kis table/token se kitni sale hui.</p>
          <TableScroll>
            <DataTable columns={['Table', 'Bills', 'Revenue']}>
              {!loaded && <SkeletonRows rows={3} cols={3} />}
              {loaded && tableSales.length === 0 && <EmptyRow span={3}>Koi data nahi hai.</EmptyRow>}
              {tableSales.map((t) => (
                <tr key={t.table}>
                  <td className={td}>{t.table}</td>
                  <td className={td}>{t.bills}</td>
                  <td className={td}>{rupee(t.revenue)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-2.5">Sales by Captain</h3>
          <p className="text-muted text-sm -mt-1 mb-2.5">Billing tab mein "Steward / Served by" select karne pe yahan track hota hai.</p>
          <TableScroll>
            <DataTable columns={['Captain', 'Bills Handled', 'Revenue']}>
              {!loaded && <SkeletonRows rows={3} cols={3} />}
              {loaded && staffSales.length === 0 && <EmptyRow span={3}>Koi data nahi hai.</EmptyRow>}
              {staffSales.map((s) => (
                <tr key={s.name}>
                  <td className={td}>{s.name}</td>
                  <td className={td}>{s.bills}</td>
                  <td className={td}>{rupee(s.revenue)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-1">Recent Bills</h3>
          <p className="text-muted text-sm mb-2">Click a bill to view items, reprint or download.</p>
          <TableScroll>
            <DataTable columns={['#', 'Time', 'Table', 'Items', 'Amount']}>
              {!loaded && <SkeletonRows rows={4} cols={5} />}
              {loaded && recentBills.length === 0 && <EmptyRow span={5}>No bills yet.</EmptyRow>}
              {loaded && recentBills.map((b) => (
                <tr key={b.id} className="cursor-pointer hover:bg-bg" onClick={() => setReceipt({ bill: b, mode: 'reprint' })}>
                  <td className={td}>{b.orderNo || '-'}</td>
                  <td className={td}>{new Date(b.ts).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</td>
                  <td className={td}>{b.table}</td>
                  <td className={td}>{b.items.length} item(s)</td>
                  <td className={td}>{rupee(b.total)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-2">Recent Expenses</h3>
          <TableScroll>
            <DataTable columns={['Date', 'Category', 'Note', 'Amount']}>
              {!loaded && <SkeletonRows rows={4} cols={4} />}
              {loaded && recentExp.length === 0 && <EmptyRow span={4}>No expenses yet.</EmptyRow>}
              {loaded && recentExp.map((x) => (
                <tr key={x.id}>
                  <td className={td}>{x.date}</td>
                  <td className={td}>{x.category}</td>
                  <td className={td}>{x.note || '-'}</td>
                  <td className={td}>{rupee(x.amount)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>
      </div>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} printArea>
        {receipt && <ReceiptContent bill={receipt.bill} restaurantName={restaurantName} restaurantDetails={restaurantDetails} />}
        <ModalActions>
          <Btn variant="primary" onClick={() => window.print()}>Reprint</Btn>
          <Btn onClick={() => receipt && downloadBill(receipt.bill, restaurantName, restaurantDetails)}>Download</Btn>
          <Btn onClick={() => setReceipt(null)}>Close</Btn>
        </ModalActions>
      </Modal>
    </section>
  );
}

const Card = memo(function Card({ label, value, color = 'text-accent-dark' }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3.5 sm:p-4 flex flex-col gap-1.5">
      <span className="text-[0.75rem] sm:text-xs text-muted uppercase tracking-wide">{label}</span>
      <span className={`text-xl sm:text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
});
