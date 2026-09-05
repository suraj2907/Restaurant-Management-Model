import { useMemo } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';

const CATEGORIES = ['Raw Material', 'Gas Cylinder', 'Rent', 'Electricity/Utility', 'Maintenance', 'Other'];

export default function ExpensesTab() {
  const [expenses, setExpenses, loaded] = useSupabaseTable('expenses', []);

  function addExpense(e) {
    e.preventDefault();
    const f = e.target;
    setExpenses([
      ...expenses,
      {
        id: uid(),
        date: f.date.value,
        category: f.category.value,
        note: f.note.value.trim(),
        amount: parseFloat(f.amount.value)
      }
    ]);
    f.reset();
    f.date.value = todayStr();
  }

  const sorted = useMemo(() => expenses.slice().sort((a, b) => b.date.localeCompare(a.date)), [expenses]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
        <h2 className="text-lg font-bold m-0">Expenses</h2>
      </div>
      <form onSubmit={addExpense} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="date" type="date" defaultValue={todayStr()} required className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <select name="category" className="px-2.5 py-2 border border-border rounded-md text-sm">
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input name="note" placeholder="Note (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="amount" type="number" step="0.01" required placeholder="Amount" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Expense</button>
      </form>
      <p className="text-muted text-sm -mt-2 mb-3.5">
        Staff salary payments and vendor purchases (via Inventory Stock-In) are logged from their own tabs and appear here automatically.
      </p>

      <TableScroll>
        <DataTable columns={['Date', 'Category', 'Note', 'Amount', '']}>
          {!loaded && <SkeletonRows rows={5} cols={5} />}
          {loaded && sorted.length === 0 && <EmptyRow span={5}>No expenses recorded yet.</EmptyRow>}
          {loaded && sorted.map((x) => (
            <tr key={x.id}>
              <td className={td}>{x.date}</td>
              <td className={td}>{x.category}</td>
              <td className={td}>{x.note || '-'}</td>
              <td className={td}>{rupee(x.amount)}</td>
              <td className={td}>
                <button className="text-bad underline text-sm" onClick={() => setExpenses(expenses.filter((e) => e.id !== x.id))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>
    </section>
  );
}
