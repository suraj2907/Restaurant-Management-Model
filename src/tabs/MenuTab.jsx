import { useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
import { VegMark } from '../components/Icons.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

const LOW_MARGIN_PCT = 40;

export default function MenuTab() {
  const [menu, setMenu, loaded] = useSupabaseTable('menu', []);
  const [editItem, setEditItem] = useState(null);

  function addItem(e) {
    e.preventDefault();
    const f = e.target;
    setMenu([
      ...menu,
      {
        id: uid(),
        name: f.name.value.trim(),
        category: f.category.value.trim(),
        price: parseFloat(f.price.value),
        cost: parseFloat(f.cost.value) || 0,
        veg: f.veg.checked,
        available: true
      }
    ]);
    f.reset();
  }

  function saveEdit(e) {
    e.preventDefault();
    const f = e.target;
    const updated = {
      ...editItem,
      name: f.name.value.trim(),
      category: f.category.value.trim(),
      price: parseFloat(f.price.value),
      cost: parseFloat(f.cost.value) || 0,
      veg: f.veg.checked
    };
    setMenu(menu.map((m) => (m.id === editItem.id ? updated : m)));
    setEditItem(null);
  }

  function toggleAvailable(item) {
    setMenu(menu.map((m) => (m.id === item.id ? { ...m, available: !(m.available !== false) } : m)));
  }

  const lowMarginCount = menu.filter((m) => {
    const pct = m.price ? ((m.price - (m.cost || 0)) / m.price) * 100 : 100;
    return m.cost && pct < LOW_MARGIN_PCT;
  }).length;

  return (
    <section>
      <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
        <h2 className="text-lg font-bold m-0">Menu Setup</h2>
        {lowMarginCount > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-bad/10 text-bad text-xs font-semibold">
            {lowMarginCount} item{lowMarginCount > 1 ? 's' : ''} below {LOW_MARGIN_PCT}% margin
          </span>
        )}
      </div>
      <form onSubmit={addItem} className="flex gap-2.5 flex-wrap items-center mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Item name" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="category" required placeholder="Category (e.g. Starters)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="price" type="number" step="0.01" required placeholder="Selling price" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="cost" type="number" step="0.01" placeholder="Cost price (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <label className="flex items-center gap-1.5 text-sm font-semibold text-muted px-1">
          <input name="veg" type="checkbox" defaultChecked className="w-4 h-4 accent-good" />
          Veg
        </label>
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Item</button>
      </form>
      <p className="text-muted text-sm -mt-2 mb-3.5">Menu prices change often — click Edit on any item to update its price or cost anytime. Toggle "86" to hide a sold-out item from Billing without deleting it.</p>

      <TableScroll>
        <DataTable columns={['Item', 'Category', 'Price', 'Cost', 'Margin', 'Status', '']}>
          {!loaded && <SkeletonRows rows={5} cols={7} />}
          {loaded && menu.length === 0 && <EmptyRow span={7}>No menu items yet.</EmptyRow>}
          {loaded && menu.map((item) => {
            const cost = item.cost || 0;
            const margin = item.price - cost;
            const marginPct = item.price ? (margin / item.price) * 100 : 0;
            const lowMargin = cost > 0 && marginPct < LOW_MARGIN_PCT;
            const available = item.available !== false;
            return (
              <tr key={item.id} className={!available ? 'opacity-50' : ''}>
                <td className={`${td} flex items-center gap-2`}>
                  <VegMark veg={item.veg !== false} />
                  {item.name}
                </td>
                <td className={td}>{item.category}</td>
                <td className={td}>{rupee(item.price)}</td>
                <td className={td}>{cost ? rupee(cost) : '-'}</td>
                <td className={`${td} ${lowMargin ? 'text-bad font-bold' : ''}`}>
                  {cost ? `${rupee(margin)} (${marginPct.toFixed(0)}%)` : '-'}
                  {lowMargin && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-bad/10 text-bad text-[0.65rem] font-bold uppercase align-middle">Low</span>}
                </td>
                <td className={td}>
                  <button
                    onClick={() => toggleAvailable(item)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${available ? 'bg-good/15 text-good border-transparent' : 'bg-bad/10 text-bad border-transparent'}`}
                  >
                    {available ? 'Available' : '86 - Out of Stock'}
                  </button>
                </td>
                <td className={`${td} space-x-2`}>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditItem(item)}>
                    Edit
                  </button>
                  <button className="text-bad underline text-sm" onClick={() => setMenu(menu.filter((m) => m.id !== item.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </TableScroll>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={editItem ? `Edit — ${editItem.name}` : ''}>
        {editItem && (
          <form onSubmit={saveEdit}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Item name</label>
              <input name="name" required defaultValue={editItem.name} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Category</label>
              <input name="category" required defaultValue={editItem.category} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Selling price</label>
              <input name="price" type="number" step="0.01" required defaultValue={editItem.price} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Cost price (optional)</label>
              <input name="cost" type="number" step="0.01" defaultValue={editItem.cost || ''} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-muted mb-3">
              <input name="veg" type="checkbox" defaultChecked={editItem.veg !== false} className="w-4 h-4 accent-good" />
              Veg
            </label>
            <ModalActions>
              <Btn variant="primary" type="submit">Save Changes</Btn>
              <Btn type="button" onClick={() => setEditItem(null)}>Cancel</Btn>
            </ModalActions>
          </form>
        )}
      </Modal>
    </section>
  );
}
