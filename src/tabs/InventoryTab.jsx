import { useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { dbInsert } from '../lib/db.js';
import { uid, todayStr, rupee } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

const EXPENSE_CATEGORIES = ['Raw Material', 'Gas Cylinder', 'Rent', 'Electricity/Utility', 'Maintenance', 'Other'];

export default function InventoryTab() {
  const [inv, setInv, invLoaded] = useSupabaseTable('inventory', []);
  const [log, setLog] = useSupabaseTable('stock_log', []);
  const [vendors] = useSupabaseTable('vendors', []);
  const [modalItem, setModalItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [movementType, setMovementType] = useState('in');

  function addItem(e) {
    e.preventDefault();
    const f = e.target;
    setInv([
      ...inv,
      {
        id: uid(),
        name: f.name.value.trim(),
        unit: f.unit.value.trim(),
        qty: parseFloat(f.qty.value),
        min: parseFloat(f.min.value),
        cost: parseFloat(f.cost.value) || 0
      }
    ]);
    f.reset();
  }

  function saveEdit(e) {
    e.preventDefault();
    const f = e.target;
    setInv(inv.map((i) => (i.id === editItem.id ? {
      ...i,
      name: f.name.value.trim(),
      unit: f.unit.value.trim(),
      min: parseFloat(f.min.value),
      cost: parseFloat(f.cost.value) || 0
    } : i)));
    setEditItem(null);
  }

  function openStockModal(item) {
    setMovementType('in');
    setModalItem(item);
  }

  async function saveMovement(e) {
    e.preventDefault();
    const f = e.target;
    const type = f.type.value;
    const qty = parseFloat(f.qty.value);
    const note = f.note.value.trim();
    if (!qty || qty <= 0) return;

    const vendorId = type === 'in' ? f.vendor.value : '';
    const vendor = vendors.find((v) => v.id === vendorId);
    const amount = type === 'in' ? parseFloat(f.amount.value) || 0 : 0;

    if (vendorId && amount <= 0) { alert('Vendor select kiya hai to amount bhi daalna zaroori hai.'); return; }

    setInv(inv.map((i) => (i.id === modalItem.id ? { ...i, qty: type === 'in' ? i.qty + qty : i.qty - qty } : i)));
    setLog([...log, { id: uid(), itemId: modalItem.id, itemName: modalItem.name, type, qty, vendor: vendor?.name || '', note, date: todayStr() }]);

    if (vendor && amount > 0) {
      const date = todayStr();
      await dbInsert('vendor_purchases', {
        id: uid(), vendorId: vendor.id, vendorName: vendor.name, date,
        itemName: modalItem.name, qty, unit: modalItem.unit, amount, note
      });
      await dbInsert('expenses', {
        id: uid(), date, category: f.category.value,
        note: `${modalItem.name} (${qty}${modalItem.unit}) from ${vendor.name}${note ? ' - ' + note : ''}`,
        amount
      });
    }

    setModalItem(null);
  }

  const recentLog = log.slice().reverse().slice(0, 15);
  const lowStock = inv.filter((i) => i.qty <= i.min);
  const inventoryValue = inv.reduce((s, i) => s + i.qty * (i.cost || 0), 0);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
        <h2 className="text-lg font-bold m-0">Inventory / Stock</h2>
        <div className="bg-surface border border-border rounded-lg px-3 py-2">
          <span className="block text-[0.72rem] text-muted uppercase">Inventory Value</span>
          <span className="font-bold">{rupee(inventoryValue)}</span>
        </div>
      </div>

      <form onSubmit={addItem} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Item name (e.g. Paneer, LPG Cylinder)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="unit" required placeholder="Unit (kg, ltr, pcs)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="qty" type="number" step="0.01" required placeholder="Current stock" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="min" type="number" step="0.01" required placeholder="Min stock alert level" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="cost" type="number" step="0.01" placeholder="Cost per unit (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add</button>
      </form>

      {lowStock.length > 0 && (
        <div className="bg-bad/5 border border-bad rounded-lg p-3.5 mb-4">
          <h3 className="font-bold text-bad m-0 mb-1.5">Reorder List — {lowStock.length} item(s) need restocking</h3>
          <p className="text-sm">
            {lowStock.map((i) => `${i.name} (${i.qty}${i.unit} left, min ${i.min}${i.unit})`).join(', ')}
          </p>
        </div>
      )}

      <TableScroll>
        <DataTable columns={['Item', 'Unit', 'Stock', 'Min Level', 'Cost/Unit', 'Status', 'Actions']}>
          {!invLoaded && <SkeletonRows rows={4} cols={7} />}
          {invLoaded && inv.length === 0 && <EmptyRow span={7}>No inventory items yet.</EmptyRow>}
          {invLoaded && inv.map((item) => {
            const low = item.qty <= item.min;
            return (
              <tr key={item.id}>
                <td className={td}>{item.name}</td>
                <td className={td}>{item.unit}</td>
                <td className={td}>{item.qty}</td>
                <td className={td}>{item.min}</td>
                <td className={td}>{item.cost ? rupee(item.cost) : '-'}</td>
                <td className={`${td} ${low ? 'text-bad font-bold' : 'text-good font-semibold'}`}>{low ? 'Low Stock!' : 'OK'}</td>
                <td className={`${td} space-x-2`}>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => openStockModal(item)}>
                    Log In/Out
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditItem(item)}>
                    Edit
                  </button>
                  <button className="text-bad underline text-sm" onClick={() => setInv(inv.filter((i) => i.id !== item.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </TableScroll>

      <h2 className="text-lg font-bold mt-6 mb-3.5">Recent Stock Movements</h2>
      <TableScroll>
        <DataTable columns={['Date', 'Item', 'Type', 'Qty', 'Vendor', 'Note']}>
          {recentLog.length === 0 && <EmptyRow span={6}>Koi movement log nahi hai abhi.</EmptyRow>}
          {recentLog.map((l) => (
            <tr key={l.id}>
              <td className={td}>{l.date}</td>
              <td className={td}>{l.itemName}</td>
              <td className={td}>{l.type === 'in' ? 'Stock In' : 'Stock Out'}</td>
              <td className={td}>{l.qty}</td>
              <td className={td}>{l.vendor || '-'}</td>
              <td className={td}>{l.note || '-'}</td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>

      <Modal open={!!modalItem} onClose={() => setModalItem(null)} title={modalItem ? `Log Movement — ${modalItem.name}` : ''}>
        <form onSubmit={saveMovement}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Type</label>
            <select name="type" value={movementType} onChange={(e) => setMovementType(e.target.value)} className="px-2.5 py-2 border border-border rounded-md text-sm">
              <option value="in">Stock In (received from vendor)</option>
              <option value="out">Stock Out (sent/used/given to vendor)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Quantity</label>
            <input name="qty" type="number" step="0.01" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>

          {movementType === 'in' && (
            <>
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-xs text-muted font-semibold">Vendor (optional)</label>
                <select name="vendor" defaultValue="" className="px-2.5 py-2 border border-border rounded-md text-sm">
                  <option value="">No vendor / manual adjustment</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {vendors.length === 0 && <span className="text-xs text-muted">Vendor select karne ke liye pehle "Vendors" tab mein vendor add karein.</span>}
              </div>
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-xs text-muted font-semibold">Amount (agar vendor se khareeda hai)</label>
                <input name="amount" type="number" step="0.01" placeholder="Total amount paid/due" className="px-2.5 py-2 border border-border rounded-md text-sm" />
              </div>
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-xs text-muted font-semibold">Expense category</label>
                <select name="category" defaultValue="Raw Material" className="px-2.5 py-2 border border-border rounded-md text-sm">
                  {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <p className="text-muted text-xs -mt-1 mb-3">Vendor + amount daalne se vendor ka payable balance aur Expenses dono automatically update ho jaayenge.</p>
            </>
          )}

          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. 2 empty given, 1 full received" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Save</Btn>
            <Btn type="button" onClick={() => setModalItem(null)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={editItem ? `Edit — ${editItem.name}` : ''}>
        {editItem && (
          <form onSubmit={saveEdit}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Item name</label>
              <input name="name" required defaultValue={editItem.name} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Unit</label>
              <input name="unit" required defaultValue={editItem.unit} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Min stock alert level</label>
              <input name="min" type="number" step="0.01" required defaultValue={editItem.min} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Cost per unit (optional)</label>
              <input name="cost" type="number" step="0.01" defaultValue={editItem.cost || ''} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <p className="text-muted text-xs -mt-1 mb-3">Current stock ({editItem.qty} {editItem.unit}) sirf "Log In/Out" se change hota hai, taaki history sahi rahe.</p>
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
