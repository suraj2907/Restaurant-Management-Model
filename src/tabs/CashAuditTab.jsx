import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { Skeleton } from '../components/Skeleton.jsx';

export default function CashAuditTab() {
  const [bills] = useSupabaseTable('bills', []);
  const [expenses] = useSupabaseTable('expenses', []);
  const [audits, setAudits, loaded] = useSupabaseTable('cash_audits', []);
  const [date, setDate] = useState(todayStr());
  const [countedInput, setCountedInput] = useState('');
  const [note, setNote] = useState('');

  const dayBills = useMemo(() => bills.filter((b) => new Date(b.ts).toISOString().slice(0, 10) === date), [bills, date]);
  const dayExpenses = useMemo(() => expenses.filter((x) => x.date === date), [expenses, date]);

  const revenue = dayBills.reduce((s, b) => s + b.total, 0);
  const kharcha = dayExpenses.reduce((s, x) => s + x.amount, 0);
  const byPayment = useMemo(() => {
    const map = {};
    for (const b of dayBills) map[b.payment] = (map[b.payment] || 0) + b.total;
    return map;
  }, [dayBills]);
  const cashRevenue = byPayment.Cash || 0;
  const estimatedCash = cashRevenue - kharcha;
  const pocketMargin = revenue - kharcha;

  const bestSellers = useMemo(() => {
    const map = {};
    for (const b of dayBills) {
      for (const i of b.items || []) {
        if (!map[i.name]) map[i.name] = { name: i.name, qty: 0, revenue: 0 };
        map[i.name].qty += i.qty;
        map[i.name].revenue += i.qty * i.price;
      }
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [dayBills]);

  const existingAudit = useMemo(() => audits.find((a) => a.date === date), [audits, date]);
  const variance = existingAudit ? existingAudit.countedCash - estimatedCash : null;

  function saveAudit(e) {
    e.preventDefault();
    const counted = parseFloat(countedInput);
    if (isNaN(counted)) return;
    if (existingAudit) {
      setAudits(audits.map((a) => (a.id === existingAudit.id ? { ...a, countedCash: counted, note } : a)));
    } else {
      setAudits([...audits, { id: uid(), date, countedCash: counted, note, createdAt: Date.now() }]);
    }
    setCountedInput('');
    setNote('');
  }

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="text-lg font-bold m-0">Daily Hisaab &amp; Cash Audit</h2>
        <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.72rem] text-muted uppercase">Revenue</span>
          <span className="font-bold text-lg">{rupee(revenue)}</span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.72rem] text-muted uppercase">Kharcha</span>
          <span className="font-bold text-lg text-bad">{rupee(kharcha)}</span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.72rem] text-muted uppercase">Net In-Pocket Margin</span>
          <span className={`font-bold text-lg ${pocketMargin >= 0 ? 'text-good' : 'text-bad'}`}>{rupee(pocketMargin)}</span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.72rem] text-muted uppercase">Bills Generated</span>
          <span className="font-bold text-lg">{dayBills.length}</span>
        </div>
      </div>

      <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2">Payment Mode Breakdown</h3>
      <div className="flex gap-3 flex-wrap mb-5">
        {['Cash', 'UPI', 'Card'].map((mode) => (
          <div key={mode} className="bg-bg border border-border rounded-lg px-3.5 py-2.5 min-w-[110px]">
            <span className="block text-[0.72rem] text-muted uppercase">{mode}</span>
            <span className="font-bold">{rupee(byPayment[mode] || 0)}</span>
          </div>
        ))}
      </div>

      <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2">Cash Galla Drawer Audit</h3>
      <div className="bg-surface border border-border rounded-lg p-3.5 mb-5">
        <p className="text-sm text-muted mb-3">
          Estimated cash in drawer = Cash sales ({rupee(cashRevenue)}) − Kharcha ({rupee(kharcha)}) = <strong className="text-ink">{rupee(estimatedCash)}</strong>
          <br />
          <span className="text-xs">(Yeh estimate hai — maan liya gaya hai ki din ka kharcha cash drawer se hi diya gaya hai.)</span>
        </p>
        {!loaded && <Skeleton className="h-10 w-full mb-3" />}
        {loaded && existingAudit && (
          <div className={`rounded-lg p-3 mb-3 ${Math.abs(variance) < 1 ? 'bg-good/10' : 'bg-bad/10'}`}>
            <span className="text-sm">
              Counted: <strong>{rupee(existingAudit.countedCash)}</strong> — Variance: <strong className={Math.abs(variance) < 1 ? 'text-good' : 'text-bad'}>{variance >= 0 ? '+' : ''}{rupee(variance)}</strong>
              {existingAudit.note && <span className="block text-xs text-muted mt-1">Note: {existingAudit.note}</span>}
            </span>
          </div>
        )}
        <form onSubmit={saveAudit} className="flex gap-2.5 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted font-semibold">Counted cash in drawer</label>
            <input value={countedInput} onChange={(e) => setCountedInput(e.target.value)} type="number" step="0.01" required placeholder={existingAudit ? String(existingAudit.countedCash) : 'e.g. 4500'} className="px-2.5 py-2 border border-border rounded-md text-sm w-48" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted font-semibold">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ₹50 short, tip diya" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">
            {existingAudit ? 'Update Count' : 'Record Count'}
          </button>
        </form>
      </div>

      <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2">Top Sellers Today</h3>
      <TableScroll>
        <DataTable columns={['Item', 'Qty Sold', 'Revenue']}>
          {bestSellers.length === 0 && <EmptyRow span={3}>Is din koi bill nahi bana.</EmptyRow>}
          {bestSellers.map((b) => (
            <tr key={b.name}>
              <td className={td}>{b.name}</td>
              <td className={td}>{b.qty}</td>
              <td className={td}>{rupee(b.revenue)}</td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>
    </section>
  );
}
