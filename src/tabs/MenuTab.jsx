import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee } from '../lib/store.js';
import { SkeletonCards } from '../components/Skeleton.jsx';
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

  const rows = useMemo(() => menu.map((item) => {
    const cost = item.cost || 0;
    const margin = item.price - cost;
    const marginPct = item.price ? (margin / item.price) * 100 : 0;
    const lowMargin = cost > 0 && marginPct < LOW_MARGIN_PCT;
    const available = item.available !== false;
    return { ...item, cost, margin, marginPct, lowMargin, available };
  }), [menu]);

  const lowMarginCount = rows.filter((m) => m.lowMargin).length;
  const outOfStockCount = rows.filter((m) => !m.available).length;
  const avgMarginPct = rows.length ? rows.reduce((s, m) => s + m.marginPct, 0) / rows.length : 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
        <h2 className="text-lg font-bold m-0">Menu Setup</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.68rem] text-muted uppercase">Menu Items</span>
          <span className="font-extrabold text-xl">{rows.length}</span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.68rem] text-muted uppercase">Avg Margin</span>
          <span className="font-extrabold text-xl">{avgMarginPct.toFixed(0)}%</span>
        </div>
        <div className={`rounded-lg p-3 border ${lowMarginCount > 0 ? 'bg-bad/10 border-bad' : 'bg-surface border-border'}`}>
          <span className={`block text-[0.68rem] uppercase ${lowMarginCount > 0 ? 'text-bad' : 'text-muted'}`}>Low Margin (&lt;{LOW_MARGIN_PCT}%)</span>
          <span className={`font-extrabold text-xl ${lowMarginCount > 0 ? 'text-bad' : ''}`}>{lowMarginCount}</span>
        </div>
        <div className={`rounded-lg p-3 border ${outOfStockCount > 0 ? 'bg-pending-container border-pending/40' : 'bg-surface border-border'}`} style={outOfStockCount > 0 ? { background: '#FEF3C7' } : undefined}>
          <span className="block text-[0.68rem] uppercase text-muted">86'd / Out of Stock</span>
          <span className="font-extrabold text-xl">{outOfStockCount}</span>
        </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {!loaded && <SkeletonCards count={6} />}
        {loaded && rows.length === 0 && <p className="text-muted text-sm col-span-full">No menu items yet.</p>}
        {loaded && rows.map((item) => (
          <div
            key={item.id}
            className={`relative rounded-xl border p-3.5 shadow-card flex flex-col gap-2 ${item.lowMargin ? 'border-bad' : 'border-border'} ${!item.available ? 'opacity-60' : ''} bg-surface`}
          >
            {item.lowMargin && (
              <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-bad text-white text-[0.62rem] font-bold uppercase shadow-tile">Low Margin</span>
            )}
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-sm flex items-center gap-1.5">
                <VegMark veg={item.veg !== false} />
                {item.name}
              </span>
              <button
                onClick={() => toggleAvailable(item)}
                className={`shrink-0 px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${item.available ? 'bg-good/15 text-good' : 'bg-bad/10 text-bad'}`}
              >
                {item.available ? 'In Stock' : '86'}
              </button>
            </div>
            <span className="text-xs text-muted -mt-1">{item.category}</span>

            <div className="grid grid-cols-3 gap-1.5 bg-well/60 rounded-lg p-2 text-center">
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Price</span>
                <span className="font-bold text-sm">{rupee(item.price)}</span>
              </div>
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Cost</span>
                <span className="font-bold text-sm">{item.cost ? rupee(item.cost) : '-'}</span>
              </div>
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Margin</span>
                <span className={`font-bold text-sm ${item.lowMargin ? 'text-bad' : 'text-good'}`}>{item.cost ? `${item.marginPct.toFixed(0)}%` : '-'}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-1">
              <button className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditItem(item)}>Edit</button>
              <button className="flex-1 py-1.5 rounded-md text-xs font-semibold text-bad border border-bad/30 hover:bg-bad/5" onClick={() => setMenu(menu.filter((m) => m.id !== item.id))}>Remove</button>
            </div>
          </div>
        ))}
      </div>

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
