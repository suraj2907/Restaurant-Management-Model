import { useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { rupee } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import BarChart from '../components/BarChart.jsx';

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

export default function ReportsTab() {
  const [bills] = useLocalState('rm_bills', []);
  const [menu] = useLocalState('rm_menu', []);
  const [range, setRange] = useState('week');

  const start = rangeStart(range);
  const filtered = bills.filter((b) => b.ts >= start);

  // Top selling items
  const itemMap = {};
  filtered.forEach((b) => b.items.forEach((i) => {
    if (!itemMap[i.name]) itemMap[i.name] = { name: i.name, qty: 0, revenue: 0 };
    itemMap[i.name].qty += i.qty;
    itemMap[i.name].revenue += i.qty * i.price;
  }));
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Category-wise sales
  const categoryOf = {};
  menu.forEach((m) => { categoryOf[m.name] = m.category; });
  const catMap = {};
  filtered.forEach((b) => b.items.forEach((i) => {
    const cat = categoryOf[i.name] || 'Uncategorized';
    if (!catMap[cat]) catMap[cat] = { category: cat, revenue: 0 };
    catMap[cat].revenue += i.qty * i.price;
  }));
  const catSales = Object.values(catMap).sort((a, b) => b.revenue - a.revenue);

  // Peak hours
  const hourRevenue = Array(24).fill(0);
  const hourCount = Array(24).fill(0);
  filtered.forEach((b) => { const h = new Date(b.ts).getHours(); hourRevenue[h] += b.total; hourCount[h] += 1; });
  const activeHours = hourRevenue.map((v, h) => ({ h, v })).filter((x) => x.v > 0);
  const hourLabels = activeHours.map((x) => `${x.h}:00`);
  const hourValues = activeHours.map((x) => x.v);

  // Staff sales
  const staffMap = {};
  filtered.forEach((b) => {
    const key = b.staffName || 'Not specified';
    if (!staffMap[key]) staffMap[key] = { name: key, revenue: 0, bills: 0 };
    staffMap[key].revenue += b.total;
    staffMap[key].bills += 1;
  });
  const staffSales = Object.values(staffMap).sort((a, b) => b.revenue - a.revenue);

  // Table-wise sales
  const tableMap = {};
  filtered.forEach((b) => {
    if (!tableMap[b.table]) tableMap[b.table] = { table: b.table, revenue: 0, bills: 0 };
    tableMap[b.table].revenue += b.total;
    tableMap[b.table].bills += 1;
  });
  const tableSales = Object.values(tableMap).sort((a, b) => b.revenue - a.revenue);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2.5 mb-4">
        <h2 className="text-lg font-bold m-0">Reports</h2>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border ${range === r.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-muted text-sm mb-5">
          Is range mein koi bill nahi hai.
        </div>
      )}

      {activeHours.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-5">
          <h3 className="font-bold mt-0 mb-1">Peak Hours (revenue by hour)</h3>
          <BarChart labels={hourLabels} valueFmt={rupee} series={[{ name: 'Revenue', color: '#b5541a', values: hourValues }]} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-2.5">Top Selling Items</h3>
          <TableScroll>
            <DataTable columns={['Item', 'Qty Sold', 'Revenue']}>
              {topItems.length === 0 && <EmptyRow span={3}>Koi data nahi hai.</EmptyRow>}
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
              {catSales.length === 0 && <EmptyRow span={2}>Koi data nahi hai.</EmptyRow>}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-2.5">Sales by Table</h3>
          <p className="text-muted text-sm -mt-1 mb-2.5">Is date range mein kis table/token se kitni sale hui — normal (overall) sales se alag, table-wise breakdown.</p>
          <TableScroll>
            <DataTable columns={['Table', 'Bills', 'Revenue']}>
              {tableSales.length === 0 && <EmptyRow span={3}>Koi data nahi hai.</EmptyRow>}
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
          <h3 className="font-bold mt-0 mb-2.5">Sales by Staff</h3>
          <p className="text-muted text-sm -mt-1 mb-2.5">Billing tab mein "Served by" select karne pe yahan track hota hai.</p>
          <TableScroll>
            <DataTable columns={['Staff', 'Bills Handled', 'Revenue']}>
              {staffSales.length === 0 && <EmptyRow span={3}>Koi data nahi hai.</EmptyRow>}
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
    </section>
  );
}
