import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee } from '../lib/store.js';
import { SkeletonCards } from '../components/Skeleton.jsx';
import { VegMark } from '../components/Icons.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

const LOW_MARGIN_PCT = 40;
const SERVICE_TYPES = [
  { id: 'dine_in', label: 'Dine-in' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'parcel', label: 'Parcel' }
];

function readServiceTypes(f) {
  return SERVICE_TYPES.filter((s) => f[`svc_${s.id}`]?.checked).map((s) => s.id);
}

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
        code: f.code.value.trim() || null,
        category: f.category.value.trim(),
        price: parseFloat(f.price.value),
        cost: parseFloat(f.cost.value) || 0,
        veg: f.veg.checked,
        available: true,
        gstIncluded: f.gstIncluded.checked,
        serviceTypes: readServiceTypes(f),
        isSpecial: f.isSpecial.checked,
        station: f.station.value
      }
    ]);
    f.reset();
  }

  function saveEdit(e) {
    e.preventDefault();
    const f = e.target;
    // editItem comes from `rows` (enriched with UI-only computed fields
    // like lowMargin/marginPct) - spreading it here used to leak those
    // into the Supabase upsert, which then failed outright (no matching
    // "low_margin" column) and silently discarded every edit. Only carry
    // over the real, persisted fields instead.
    const updated = {
      id: editItem.id,
      available: editItem.available,
      name: f.name.value.trim(),
      code: f.code.value.trim() || null,
      category: f.category.value.trim(),
      price: parseFloat(f.price.value),
      cost: parseFloat(f.cost.value) || 0,
      veg: f.veg.checked,
      gstIncluded: f.gstIncluded.checked,
      serviceTypes: readServiceTypes(f),
      isSpecial: f.isSpecial.checked,
      station: f.station.value
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

  // Today's Special gets its own section up top (star icon, not buried in
  // its station/category group) - everything else is grouped Station
  // (top-level, drives KOT routing) -> Category (sub-level within it).
  const specialRows = useMemo(() => rows.filter((m) => m.isSpecial), [rows]);
  const groupedRows = useMemo(() => {
    const stations = new Map(); // station label -> Map(category -> items[])
    for (const m of rows) {
      if (m.isSpecial) continue;
      const stationLabel = m.station === 'bristo' ? 'Bristo / Bar' : 'Kitchen';
      if (!stations.has(stationLabel)) stations.set(stationLabel, new Map());
      const cats = stations.get(stationLabel);
      const cat = m.category || 'Uncategorized';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push(m);
    }
    return stations;
  }, [rows]);

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
        <input name="code" placeholder="Code (e.g. D1)" className="px-2.5 py-2 border border-border rounded-md text-sm w-24" />
        <input name="category" required placeholder="Category (e.g. Starters)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="price" type="number" step="0.01" required placeholder="Selling price" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="cost" type="number" step="0.01" placeholder="Cost price (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <label className="flex items-center gap-1.5 text-sm font-semibold text-muted px-1">
          <input name="veg" type="checkbox" defaultChecked className="w-4 h-4 accent-good" />
          Veg
        </label>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-muted px-1">
          <input name="gstIncluded" type="checkbox" defaultChecked className="w-4 h-4 accent-accent" />
          GST Included
        </label>
        <select name="station" defaultValue="kitchen" className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="kitchen">Kitchen</option>
          <option value="bristo">Bristo / Bar</option>
        </select>
        <span className="flex items-center gap-2.5 text-xs text-muted px-1">
          {SERVICE_TYPES.map((s) => (
            <label key={s.id} className="flex items-center gap-1 font-semibold">
              <input name={`svc_${s.id}`} type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-accent" />
              {s.label}
            </label>
          ))}
        </span>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-secondary-dark px-1">
          <input name="isSpecial" type="checkbox" className="w-4 h-4 accent-secondary" />
          Today's Special
        </label>
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Item</button>
      </form>
      <p className="text-muted text-sm -mt-2 mb-3.5">Menu prices change often — click Edit on any item to update its price or cost anytime. Toggle "86" to hide a sold-out item from Billing without deleting it.</p>

      {!loaded && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><SkeletonCards count={6} /></div>}
      {loaded && rows.length === 0 && <p className="text-muted text-sm">No menu items yet.</p>}

      {loaded && specialRows.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-bold text-secondary-dark uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <span>⭐</span> Today's Special
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {specialRows.map((item) => (
              <MenuItemCard key={item.id} item={item} onEdit={setEditItem} onToggleAvailable={toggleAvailable} onRemove={() => setMenu(menu.filter((m) => m.id !== item.id))} />
            ))}
          </div>
        </div>
      )}

      {loaded && [...groupedRows.entries()].map(([station, cats]) => (
        <div key={station} className="mb-5">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-2 pb-1 border-b border-border">{station}</h3>
          {[...cats.entries()].map(([cat, items]) => (
            <div key={cat} className="mb-3.5">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wide mb-2">{cat}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((item) => (
                  <MenuItemCard key={item.id} item={item} onEdit={setEditItem} onToggleAvailable={toggleAvailable} onRemove={() => setMenu(menu.filter((m) => m.id !== item.id))} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={editItem ? `Edit — ${editItem.name}` : ''}>
        {editItem && (
          <form onSubmit={saveEdit}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Item name</label>
              <input name="name" required defaultValue={editItem.name} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Code (optional — Billing mein search/quick-add ke liye)</label>
              <input name="code" defaultValue={editItem.code || ''} placeholder="e.g. D1" className="px-2.5 py-2 border border-border rounded-md text-sm" />
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
            <label className="flex items-center gap-1.5 text-sm font-semibold text-muted mb-3">
              <input name="gstIncluded" type="checkbox" defaultChecked={editItem.gstIncluded !== false} className="w-4 h-4 accent-accent" />
              GST Included in price
            </label>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Kitchen station (KOT routing)</label>
              <select name="station" defaultValue={editItem.station || 'kitchen'} className="px-2.5 py-2 border border-border rounded-md text-sm">
                <option value="kitchen">Kitchen</option>
                <option value="bristo">Bristo / Bar</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Available for</label>
              <div className="flex gap-3">
                {SERVICE_TYPES.map((s) => (
                  <label key={s.id} className="flex items-center gap-1 text-sm font-semibold">
                    <input name={`svc_${s.id}`} type="checkbox" defaultChecked={(editItem.serviceTypes || ['dine_in', 'delivery', 'parcel']).includes(s.id)} className="w-4 h-4 accent-accent" />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-secondary-dark mb-3">
              <input name="isSpecial" type="checkbox" defaultChecked={!!editItem.isSpecial} className="w-4 h-4 accent-secondary" />
              Today's Special
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

function MenuItemCard({ item, onEdit, onToggleAvailable, onRemove }) {
  return (
    <div className={`relative rounded-xl border p-3.5 shadow-card flex flex-col gap-2 ${item.lowMargin ? 'border-bad' : item.isSpecial ? 'border-secondary/50' : 'border-border'} ${!item.available ? 'opacity-60' : ''} bg-surface`}>
      {item.lowMargin && (
        <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-bad text-white text-[0.62rem] font-bold uppercase shadow-tile">Low Margin</span>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-sm flex items-center gap-1.5">
          {item.isSpecial && <span title="Today's Special">⭐</span>}
          <VegMark veg={item.veg !== false} />
          {item.name}
          {item.code && <span className="px-1.5 py-0.5 rounded bg-well text-muted text-[0.6rem] font-mono font-bold">{item.code}</span>}
        </span>
        <button
          onClick={() => onToggleAvailable(item)}
          className={`shrink-0 px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${item.available ? 'bg-good/15 text-good' : 'bg-bad/10 text-bad'}`}
        >
          {item.available ? 'In Stock' : '86'}
        </button>
      </div>
      <span className="text-xs text-muted -mt-1">{item.category}{!item.gstIncluded && <span className="ml-1.5 px-1 py-0.5 rounded bg-pending/10 text-pending-text font-semibold">Non-GST</span>}</span>

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
        <button className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => onEdit(item)}>Edit</button>
        <button className="flex-1 py-1.5 rounded-md text-xs font-semibold text-bad border border-bad/30 hover:bg-bad/5" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}
