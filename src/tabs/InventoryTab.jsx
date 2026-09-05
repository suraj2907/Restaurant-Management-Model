import { useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { uid, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

export default function InventoryTab() {
  const [inv, setInv] = useLocalState('rm_inventory', []);
  const [log, setLog] = useLocalState('rm_stock_log', []);
  const [modalItem, setModalItem] = useState(null);

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
        min: parseFloat(f.min.value)
      }
    ]);
    f.reset();
  }

  function saveMovement(e) {
    e.preventDefault();
    const f = e.target;
    const type = f.type.value;
    const qty = parseFloat(f.qty.value);
    const note = f.note.value.trim();
    if (!qty || qty <= 0) return;

    setInv(inv.map((i) => (i.id === modalItem.id ? { ...i, qty: type === 'in' ? i.qty + qty : i.qty - qty } : i)));
    setLog([...log, { id: uid(), itemId: modalItem.id, itemName: modalItem.name, type, qty, note, date: todayStr() }]);
    setModalItem(null);
  }

  const recentLog = log.slice().reverse().slice(0, 15);

  return (
    <section>
      <h2 className="text-lg font-bold mb-3.5">Inventory / Stock</h2>
      <form onSubmit={addItem} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Item name (e.g. Paneer, LPG Cylinder)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="unit" required placeholder="Unit (kg, ltr, pcs)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="qty" type="number" step="0.01" required placeholder="Current stock" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="min" type="number" step="0.01" required placeholder="Min stock alert level" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add</button>
      </form>

      <TableScroll>
        <DataTable columns={['Item', 'Unit', 'Stock', 'Min Level', 'Status', 'Log Movement', '']}>
          {inv.length === 0 && <EmptyRow span={7}>No inventory items yet.</EmptyRow>}
          {inv.map((item) => {
            const low = item.qty <= item.min;
            return (
              <tr key={item.id}>
                <td className={td}>{item.name}</td>
                <td className={td}>{item.unit}</td>
                <td className={td}>{item.qty}</td>
                <td className={td}>{item.min}</td>
                <td className={`${td} ${low ? 'text-bad font-bold' : 'text-good font-semibold'}`}>{low ? 'Low Stock!' : 'OK'}</td>
                <td className={td}>
                  <button
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border"
                    onClick={() => setModalItem(item)}
                  >
                    Log In/Out
                  </button>
                </td>
                <td className={td}>
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
        <DataTable columns={['Date', 'Item', 'Type', 'Qty', 'Note']}>
          {recentLog.length === 0 && <EmptyRow span={5}>Koi movement log nahi hai abhi.</EmptyRow>}
          {recentLog.map((l) => (
            <tr key={l.id}>
              <td className={td}>{l.date}</td>
              <td className={td}>{l.itemName}</td>
              <td className={td}>{l.type === 'in' ? 'Stock In' : 'Stock Out'}</td>
              <td className={td}>{l.qty}</td>
              <td className={td}>{l.note || '-'}</td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>

      <Modal open={!!modalItem} onClose={() => setModalItem(null)} title={modalItem ? `Log Movement — ${modalItem.name}` : ''}>
        <form onSubmit={saveMovement}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Type</label>
            <select name="type" defaultValue="in" className="px-2.5 py-2 border border-border rounded-md text-sm">
              <option value="in">Stock In (received from vendor)</option>
              <option value="out">Stock Out (sent/used/given to vendor)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Quantity</label>
            <input name="qty" type="number" step="0.01" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. Vendor exchange - 2 empty given, 1 full received" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Save</Btn>
            <Btn type="button" onClick={() => setModalItem(null)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>
    </section>
  );
}
