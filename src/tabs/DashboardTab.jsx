import { useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { rupee, store } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
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

export default function DashboardTab() {
  const [bills] = useLocalState('rm_bills', []);
  const [expenses] = useLocalState('rm_expenses', []);
  const [range, setRange] = useState('today');
  const [receipt, setReceipt] = useState(null);
  const restaurantName = store.get('rm_name', 'My Restaurant');

  const start = rangeStart(range);
  const filteredBills = bills.filter((b) => b.ts >= start);
  const filteredExp = expenses.filter((x) => new Date(x.date + 'T00:00:00').getTime() >= start);
  const revenue = filteredBills.reduce((s, b) => s + b.total, 0);
  const expTotal = filteredExp.reduce((s, x) => s + x.amount, 0);
  const profit = revenue - expTotal;

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

  const recentBills = bills.slice().sort((a, b) => b.ts - a.ts).slice(0, 8);
  const recentExp = expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2.5 mb-3.5">
        <h2 className="text-lg font-bold m-0">Profit &amp; Loss Dashboard</h2>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border ${range === r.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <Card label="Revenue" value={rupee(revenue)} color="text-good" />
        <Card label="Expenses" value={rupee(expTotal)} color="text-bad" />
        <Card label="Profit / Loss" value={rupee(profit)} color={profit >= 0 ? 'text-good' : 'text-bad'} />
        <Card label="Bills Generated" value={filteredBills.length} />
      </div>

      <div className="bg-surface border border-border rounded-lg p-4 mb-6">
        <h3 className="font-bold mb-1">Revenue vs Expense (last 7 days)</h3>
        <BarChart labels={dayLabels} valueFmt={rupee} series={[
          { name: 'Revenue', color: '#3f7d47', values: dayRev },
          { name: 'Expense', color: '#b23b3b', values: dayExp }
        ]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="font-bold mt-0 mb-1">Recent Bills</h3>
          <p className="text-muted text-sm mb-2">Click a bill to view items, reprint or download.</p>
          <TableScroll>
            <DataTable columns={['#', 'Time', 'Table', 'Items', 'Amount']}>
              {recentBills.length === 0 && <EmptyRow span={5}>No bills yet.</EmptyRow>}
              {recentBills.map((b) => (
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
              {recentExp.length === 0 && <EmptyRow span={4}>No expenses yet.</EmptyRow>}
              {recentExp.map((x) => (
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
        {receipt && <ReceiptContent bill={receipt.bill} restaurantName={restaurantName} />}
        <ModalActions>
          <Btn variant="primary" onClick={() => window.print()}>Reprint</Btn>
          <Btn onClick={() => receipt && downloadBill(receipt.bill, restaurantName)}>Download</Btn>
          <Btn onClick={() => setReceipt(null)}>Close</Btn>
        </ModalActions>
      </Modal>
    </section>
  );
}

function Card({ label, value, color = 'text-accent-dark' }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3.5 sm:p-4 flex flex-col gap-1.5">
      <span className="text-[0.75rem] sm:text-xs text-muted uppercase tracking-wide">{label}</span>
      <span className={`text-xl sm:text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
}
