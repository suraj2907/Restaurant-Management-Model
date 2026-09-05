import { useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { uid, rupee, POINTS_PER_RUPEE } from '../lib/store.js';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';
import { ReceiptContent, downloadBill } from '../components/Receipt.jsx';

export default function BillingTab({ restaurantName }) {
  const [tables, setTables] = useLocalState('rm_tables', []);
  const [openOrders, setOpenOrders] = useLocalState('rm_open_orders', {});
  const [menu] = useLocalState('rm_menu', []);
  const [staff] = useLocalState('rm_staff', []);
  const [bills, setBills] = useLocalState('rm_bills', []);
  const [customers, setCustomers] = useLocalState('rm_customers', []);
  const [loyaltyLog, setLoyaltyLog] = useLocalState('rm_loyalty_log', []);

  const [activeTable, setActiveTable] = useState(null);
  const [search, setSearch] = useState('');
  const [gstPct, setGstPct] = useState(5);
  const [payment, setPayment] = useState('Cash');
  const [customerPhone, setCustomerPhone] = useState('');
  const [servedBy, setServedBy] = useState('');
  const [receipt, setReceipt] = useState(null); // { bill, mode }
  const [kot, setKot] = useState(null); // { table, items, ts }
  const [addTableOpen, setAddTableOpen] = useState(false);

  const items = activeTable ? openOrders[activeTable] || [] : [];
  const subtotal = items.reduce((s, o) => s + o.price * o.qty, 0);
  const gst = (subtotal * gstPct) / 100;
  const total = subtotal + gst;

  // Always update from the latest state (functional form), not the closure
  // value - a user clicking two different menu items in quick succession
  // would otherwise batch onto the same stale snapshot and the second
  // click's update would clobber the first.
  function updateOrder(table, updater) {
    setOpenOrders((prev) => {
      const arr = updater(prev[table] || []);
      const next = { ...prev };
      if (arr.length === 0) delete next[table];
      else next[table] = arr;
      return next;
    });
  }

  function addTable(name) {
    const clean = (name || '').trim();
    if (!clean) return;
    if (tables.includes(clean)) { alert('Ye table already exist karta hai.'); return; }
    setTables((prev) => [...prev, clean]);
    setActiveTable(clean);
    setAddTableOpen(false);
  }

  function removeTable(name) {
    if ((openOrders[name] || []).length > 0 && !confirm(`Table "${name}" mein pending order hai. Phir bhi remove karein?`)) return;
    setTables((prev) => prev.filter((t) => t !== name));
    setOpenOrders((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (activeTable === name) setActiveTable(null);
  }

  function addItem(menuItem) {
    if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
    updateOrder(activeTable, (arr) => {
      const existing = arr.find((o) => o.menuId === menuItem.id);
      if (existing) return arr.map((o) => (o.menuId === menuItem.id ? { ...o, qty: o.qty + 1 } : o));
      return [...arr, { menuId: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1 }];
    });
  }

  function incDec(menuId, delta) {
    updateOrder(activeTable, (arr) =>
      arr
        .map((o) => (o.menuId === menuId ? { ...o, qty: o.qty + delta } : o))
        .filter((o) => o.qty > 0)
    );
  }

  function clearTable() {
    if (!activeTable) return;
    updateOrder(activeTable, () => []);
  }

  function sendToKitchen() {
    if (!activeTable || items.length === 0) { alert('Order khaali hai.'); return; }
    setKot({ table: activeTable, items, ts: Date.now() });
  }

  function completeBill() {
    if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
    if (items.length === 0) { alert('Order khaali hai. Pehle items add karo.'); return; }

    const staffMember = staff.find((s) => s.id === servedBy);
    const phone = customerPhone.trim();

    const bill = {
      id: uid(),
      ts: Date.now(),
      table: activeTable,
      items: items.map((o) => ({ name: o.name, qty: o.qty, price: o.price })),
      subtotal, gstPct, gst, total,
      payment,
      staffId: staffMember?.id || null,
      staffName: staffMember?.name || null,
      customerId: null
    };

    if (phone) {
      const existing = customers.find((c) => c.phone === phone);
      const earned = Math.floor(total / POINTS_PER_RUPEE);
      const customerId = existing?.id || uid();
      bill.customerId = customerId;

      setCustomers((prev) => {
        const found = prev.find((c) => c.id === customerId);
        if (found) {
          return prev.map((c) => (c.id === customerId ? { ...c, visits: c.visits + 1, totalSpent: c.totalSpent + total, points: c.points + earned } : c));
        }
        return [...prev, { id: customerId, name: '', phone, joinDate: new Date().toISOString().slice(0, 10), visits: 1, totalSpent: total, points: earned }];
      });

      if (earned > 0) {
        setLoyaltyLog((prev) => [...prev, { id: uid(), customerId, customerName: existing?.name || phone, date: new Date().toISOString().slice(0, 10), type: 'earn', points: earned, note: `Bill - Table ${activeTable}` }]);
      }
    }

    setBills((prev) => [...prev, bill]);
    updateOrder(activeTable, () => []);
    setCustomerPhone('');
    setServedBy('');
    setReceipt({ bill, mode: 'print' });
  }

  const filteredMenu = menu.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <section>
      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <div className="flex gap-2 flex-wrap">
          {tables.map((t) => {
            const hasOrder = (openOrders[t] || []).length > 0;
            return (
              <div
                key={t}
                onClick={() => setActiveTable(t)}
                className={`relative px-3.5 py-2 border rounded-lg cursor-pointer font-semibold text-sm flex items-center gap-1.5 ${
                  t === activeTable ? 'bg-accent text-white border-accent' : 'bg-surface border-border'
                }`}
              >
                {hasOrder && <span className={`w-1.5 h-1.5 rounded-full ${t === activeTable ? 'bg-white' : 'bg-accent-dark'}`} />}
                {t}
                <span
                  className="ml-0.5 opacity-60 hover:opacity-100 font-bold"
                  onClick={(e) => { e.stopPropagation(); removeTable(t); }}
                >
                  ×
                </span>
              </div>
            );
          })}
        </div>
        <button onClick={() => setAddTableOpen(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg border border-border">+ Table</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="text-lg font-bold m-0">Menu</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item..." className="px-2.5 py-1.5 border border-border rounded-md text-sm w-full sm:w-auto" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
            {filteredMenu.length === 0 && <div className="col-span-full text-muted text-sm text-center py-5">No items found.</div>}
            {filteredMenu.map((item) => (
              <button key={item.id} onClick={() => addItem(item)} className="border border-border rounded-lg p-2.5 text-left bg-bg hover:border-accent">
                <span className="font-semibold text-sm block">{item.name}</span>
                <span className="text-xs text-muted block my-0.5">{item.category}</span>
                <span className="font-bold text-accent-dark">{rupee(item.price)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-lg font-bold m-0">{activeTable ? `Current Order — ${activeTable}` : 'Select a table to start order'}</h2>
          <div className="min-h-[100px] max-h-[300px] overflow-y-auto mt-2.5">
            {items.length === 0 && (
              <div className="text-muted text-sm text-center py-5">
                {activeTable ? 'No items added yet. Click menu items to add.' : 'Table select karke items add karein.'}
              </div>
            )}
            {items.map((o) => (
              <div key={o.menuId} className="flex items-center justify-between gap-2 py-2 border-b border-border">
                <span className="flex-1 text-sm">{o.name}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => incDec(o.menuId, -1)} className="w-6 h-6 rounded-md border border-border bg-bg">−</button>
                  <span>{o.qty}</span>
                  <button onClick={() => incDec(o.menuId, 1)} className="w-6 h-6 rounded-md border border-border bg-bg">+</button>
                </div>
                <span className="w-[70px] text-right font-semibold">{rupee(o.price * o.qty)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3.5 border-t border-dashed border-border pt-2.5 text-sm">
            <div className="flex justify-between py-1"><span>Subtotal</span><span>{rupee(subtotal)}</span></div>
            <div className="flex justify-between py-1 items-center">
              <span>GST (<input type="number" value={gstPct} onChange={(e) => setGstPct(parseFloat(e.target.value) || 0)} className="w-12 border border-border rounded px-1" />%)</span>
              <span>{rupee(gst)}</span>
            </div>
            <div className="flex justify-between py-2 border-t border-border mt-1.5 font-bold text-base"><span>Total</span><span>{rupee(total)}</span></div>
          </div>

          <div className="flex gap-2.5 mt-3 flex-wrap items-center text-sm">
            <label className="text-muted">Payment:</label>
            <select value={payment} onChange={(e) => setPayment(e.target.value)} className="px-2 py-1.5 border border-border rounded-md">
              <option>Cash</option><option>UPI</option><option>Card</option>
            </select>
          </div>
          {staff.length > 0 && (
            <div className="flex gap-2.5 mt-2 flex-wrap items-center text-sm">
              <label className="text-muted">Served by:</label>
              <select value={servedBy} onChange={(e) => setServedBy(e.target.value)} className="px-2 py-1.5 border border-border rounded-md">
                <option value="">Not specified</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2.5 mt-2 flex-wrap items-center text-sm">
            <label className="text-muted">Customer phone:</label>
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional - for loyalty points" className="px-2 py-1.5 border border-border rounded-md flex-1 min-w-[140px]" />
          </div>

          <div className="flex gap-2.5 mt-3.5 flex-wrap">
            <Btn onClick={clearTable}>Clear Table</Btn>
            <Btn onClick={sendToKitchen}>Send to Kitchen (KOT)</Btn>
            <Btn variant="primary" onClick={completeBill}>Complete Bill &amp; Print</Btn>
          </div>
        </div>
      </div>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} printArea>
        {receipt && <ReceiptContent bill={receipt.bill} restaurantName={restaurantName} />}
        <ModalActions>
          <Btn variant="primary" onClick={() => window.print()}>{receipt?.mode === 'reprint' ? 'Reprint' : 'Print'}</Btn>
          <Btn onClick={() => receipt && downloadBill(receipt.bill, restaurantName)}>Download</Btn>
          <Btn onClick={() => setReceipt(null)}>Close</Btn>
        </ModalActions>
      </Modal>

      <Modal open={!!kot} onClose={() => setKot(null)} printArea>
        {kot && (
          <div className="font-mono text-sm">
            <div className="text-center font-bold text-base mb-1">KITCHEN ORDER TICKET</div>
            <div className="text-center text-xs text-muted mb-2.5">
              {new Date(kot.ts).toLocaleString('en-IN')}<br />Table/Token: {kot.table}
            </div>
            <hr className="border-dashed my-2" />
            {kot.items.map((i) => (
              <div key={i.menuId} className="flex justify-between font-semibold">
                <span>{i.name}</span><span>x{i.qty}</span>
              </div>
            ))}
            <hr className="border-dashed my-2" />
          </div>
        )}
        <ModalActions>
          <Btn variant="primary" onClick={() => window.print()}>Print KOT</Btn>
          <Btn onClick={() => setKot(null)}>Close</Btn>
        </ModalActions>
      </Modal>

      <Modal open={addTableOpen} onClose={() => setAddTableOpen(false)} title="Add Table / Token">
        <form onSubmit={(e) => { e.preventDefault(); addTable(e.target.name.value); }}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Name</label>
            <input name="name" required autoFocus placeholder="e.g. T5, Parcel-2" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Add</Btn>
            <Btn type="button" onClick={() => setAddTableOpen(false)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>
    </section>
  );
}

