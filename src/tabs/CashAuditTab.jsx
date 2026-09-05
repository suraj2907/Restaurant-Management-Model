import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { Skeleton } from '../components/Skeleton.jsx';
import BarChart from '../components/BarChart.jsx';

function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function CashAuditTab() {
  const [bills] = useSupabaseTable('bills', []);
  const [expenses] = useSupabaseTable('expenses', []);
  const [audits, setAudits, loaded] = useSupabaseTable('cash_audits', []);
  const [date, setDate] = useState(todayStr());
  const [openingInput, setOpeningInput] = useState('');
  const [countedInput, setCountedInput] = useState('');
  const [note, setNote] = useState('');

  const dayBills = useMemo(() => bills.filter((b) => new Date(b.ts).toISOString().slice(0, 10) === date), [bills, date]);
  const yesterdayBills = useMemo(() => bills.filter((b) => new Date(b.ts).toISOString().slice(0, 10) === shiftDate(date, -1)), [bills, date]);
  const dayExpenses = useMemo(() => expenses.filter((x) => x.date === date), [expenses, date]);

  const revenue = dayBills.reduce((s, b) => s + b.total, 0);
  const yesterdayRevenue = yesterdayBills.reduce((s, b) => s + b.total, 0);
  const vsYesterdayPct = yesterdayRevenue > 0 ? ((revenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;
  const avgBill = dayBills.length ? revenue / dayBills.length : 0;
  const kharcha = dayExpenses.reduce((s, x) => s + x.amount, 0);
  const byPayment = useMemo(() => {
    const map = {};
    for (const b of dayBills) map[b.payment] = (map[b.payment] || 0) + b.total;
    return map;
  }, [dayBills]);
  const cashRevenue = byPayment.Cash || 0;
  const pocketMargin = revenue - kharcha;
  const marginPct = revenue > 0 ? (pocketMargin / revenue) * 100 : 0;

  const existingAudit = useMemo(() => audits.find((a) => a.date === date), [audits, date]);
  const openingCash = existingAudit?.openingCash || 0;
  const expectedCash = openingCash + cashRevenue - kharcha;
  const variance = existingAudit ? existingAudit.countedCash - expectedCash : null;
  const matched = existingAudit && Math.abs(variance) < 1;

  const bestSellers = useMemo(() => {
    const map = {};
    for (const b of dayBills) {
      for (const i of b.items || []) {
        if (!map[i.name]) map[i.name] = { name: i.name, qty: 0, revenue: 0 };
        map[i.name].qty += i.qty;
        map[i.name].revenue += i.qty * i.price;
      }
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [dayBills]);

  const staffSales = useMemo(() => {
    const map = {};
    for (const b of dayBills) {
      const key = b.staffName || 'Not specified';
      if (!map[key]) map[key] = { name: key, bills: 0, revenue: 0 };
      map[key].bills += 1;
      map[key].revenue += b.total;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [dayBills]);

  const hourly = useMemo(() => {
    const hours = Array.from({ length: 13 }, (_, i) => 10 + i); // 10AM..10PM service window
    const values = hours.map((h) => dayBills.filter((b) => new Date(b.ts).getHours() === h).reduce((s, b) => s + b.total, 0));
    return { labels: hours.map((h) => (h > 12 ? `${h - 12}PM` : h === 12 ? '12PM' : `${h}AM`)), values };
  }, [dayBills]);

  function saveAudit(e) {
    e.preventDefault();
    const counted = parseFloat(countedInput);
    if (isNaN(counted)) return;
    const opening = openingInput === '' ? openingCash : parseFloat(openingInput) || 0;
    if (existingAudit) {
      setAudits(audits.map((a) => (a.id === existingAudit.id ? { ...a, openingCash: opening, countedCash: counted, note } : a)));
    } else {
      setAudits([...audits, { id: uid(), date, openingCash: opening, countedCash: counted, note, createdAt: Date.now() }]);
    }
    setOpeningInput('');
    setCountedInput('');
    setNote('');
  }

  function sendWhatsappSummary() {
    const lines = [
      `*Daily Hisaab — ${date}*`,
      `Gross Sales: ${rupee(revenue)} (${dayBills.length} bills)`,
      `Kharcha: ${rupee(kharcha)}`,
      `Net In-Pocket Margin: ${rupee(pocketMargin)} (${marginPct.toFixed(1)}%)`,
      `Cash: ${rupee(byPayment.Cash || 0)} | UPI: ${rupee(byPayment.UPI || 0)} | Card: ${rupee(byPayment.Card || 0)}`,
      existingAudit ? `Cash Drawer: Expected ${rupee(expectedCash)}, Counted ${rupee(existingAudit.countedCash)} (${matched ? 'Matched' : `Variance ${rupee(variance)}`})` : ''
    ].filter(Boolean);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  }

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5 bg-surface border border-border rounded-lg p-4">
        <div>
          <h2 className="text-lg font-bold m-0">Daily Hisaab &amp; Cash Audit</h2>
          <p className="text-muted text-xs mt-0.5">Real-time owner tally, galla cash count aur direct margin audit.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setDate(shiftDate(date, -1))} className="w-8 h-8 rounded-lg border border-border bg-bg font-bold">‹</button>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm" />
          <button onClick={() => setDate(shiftDate(date, 1))} disabled={date >= todayStr()} className="w-8 h-8 rounded-lg border border-border bg-bg font-bold disabled:opacity-30">›</button>
          <button onClick={sendWhatsappSummary} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-good text-white hover:opacity-90">Send Summary via WhatsApp</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-surface border border-border rounded-lg p-3.5">
          <span className="block text-[0.72rem] text-muted uppercase">Gross Sales</span>
          <span className="font-extrabold text-2xl block">{rupee(revenue)}</span>
          <span className="text-xs text-muted">
            {vsYesterdayPct !== null && (
              <span className={vsYesterdayPct >= 0 ? 'text-good font-semibold' : 'text-bad font-semibold'}>
                {vsYesterdayPct >= 0 ? '+' : ''}{vsYesterdayPct.toFixed(1)}% vs yesterday •{' '}
              </span>
            )}
            {dayBills.length} bills • Avg {rupee(avgBill)}
          </span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3.5">
          <span className="block text-[0.72rem] text-muted uppercase">Payment Mode Split</span>
          <div className="flex flex-col gap-0.5 mt-1">
            {['Cash', 'UPI', 'Card'].map((mode) => (
              <div key={mode} className="flex justify-between text-xs">
                <span className="text-muted">{mode}</span>
                <span className="font-semibold">{rupee(byPayment[mode] || 0)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3.5">
          <span className="block text-[0.72rem] text-muted uppercase">Direct Kharcha</span>
          <span className="font-extrabold text-2xl block text-bad">{rupee(kharcha)}</span>
          <span className="text-xs text-muted">{dayExpenses.length} entries today</span>
        </div>
        <div className="bg-good-container rounded-lg p-3.5" style={{ background: '#DCFCE7' }}>
          <span className="block text-[0.72rem] text-good-text uppercase">Estimated In-Pocket Cash</span>
          <span className="font-extrabold text-2xl block text-good-text">{rupee(pocketMargin)}</span>
          <span className="text-xs text-good-text">Today's Operating Margin {marginPct.toFixed(1)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2">Hisaab-e-Galla (Cash Drawer Audit)</h3>
          <div className="bg-surface border border-border rounded-lg p-3.5 mb-5">
            {existingAudit && (
              <span className={`inline-block mb-3 px-2.5 py-1 rounded-full text-xs font-bold ${matched ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>
                {matched ? '✓ Matched / Nil Discrepancy' : `Variance ${variance >= 0 ? '+' : ''}${rupee(variance)}`}
              </span>
            )}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="bg-bg border border-border rounded-lg p-2.5">
                <span className="block text-[0.68rem] text-muted uppercase">Opening Cash</span>
                <span className="font-bold">{rupee(openingCash)}</span>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: '#DCFCE7' }}>
                <span className="block text-[0.68rem] uppercase text-good-text">+ Cash Sales</span>
                <span className="font-bold text-good-text">{rupee(cashRevenue)}</span>
              </div>
              <div className="rounded-lg p-2.5 col-span-2" style={{ background: '#FEE2E2' }}>
                <span className="block text-[0.68rem] uppercase text-bad">− Kharcha (Cash Out)</span>
                <span className="font-bold text-bad">{rupee(kharcha)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="bg-well rounded-lg p-2.5">
                <span className="block text-[0.68rem] text-muted uppercase">Calculated Expected Cash</span>
                <span className="font-bold text-lg">{rupee(expectedCash)}</span>
              </div>
              <div className="bg-well rounded-lg p-2.5">
                <span className="block text-[0.68rem] text-muted uppercase">Counted Physical Cash</span>
                <span className="font-bold text-lg">{existingAudit ? rupee(existingAudit.countedCash) : '—'}</span>
              </div>
            </div>
            {!loaded && <Skeleton className="h-10 w-full mb-3" />}
            <form onSubmit={saveAudit} className="flex gap-2.5 flex-wrap items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted font-semibold">Opening cash</label>
                <input value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} type="number" step="0.01" placeholder={String(openingCash)} className="px-2.5 py-2 border border-border rounded-md text-sm w-32" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted font-semibold">Counted cash</label>
                <input value={countedInput} onChange={(e) => setCountedInput(e.target.value)} type="number" step="0.01" required placeholder="e.g. 4500" className="px-2.5 py-2 border border-border rounded-md text-sm w-32" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted font-semibold">Note</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ₹50 short" className="px-2.5 py-2 border border-border rounded-md text-sm" />
              </div>
              <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">
                {existingAudit ? 'Update' : 'Record'}
              </button>
            </form>
            {existingAudit?.note && <p className="text-xs text-muted mt-2">Note: {existingAudit.note}</p>}
          </div>

          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2">Hourly Rush &amp; Bill Volume</h3>
          <div className="bg-surface border border-border rounded-lg p-3.5">
            {dayBills.length === 0 ? (
              <p className="text-muted text-sm">Is din koi bill nahi bana.</p>
            ) : (
              <BarChart labels={hourly.labels} series={[{ name: 'Sales', color: '#D9531E', values: hourly.values }]} valueFmt={rupee} />
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2">Top Selling Items</h3>
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

          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-2 mt-5">Staff Sales &amp; Table Punching</h3>
          <TableScroll>
            <DataTable columns={['Staff', 'Bills', 'Sales', 'Avg/Bill']}>
              {staffSales.length === 0 && <EmptyRow span={4}>Is din koi bill nahi bana.</EmptyRow>}
              {staffSales.map((s) => (
                <tr key={s.name}>
                  <td className={td}>{s.name}</td>
                  <td className={td}>{s.bills}</td>
                  <td className={td}>{rupee(s.revenue)}</td>
                  <td className={td}>{rupee(s.revenue / s.bills)}</td>
                </tr>
              ))}
            </DataTable>
          </TableScroll>
        </div>
      </div>
    </section>
  );
}
