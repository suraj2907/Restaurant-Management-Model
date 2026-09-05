import { useEffect, useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { nextOrderNumber, dbInsert } from '../lib/db.js';
import { uid, rupee, POINTS_PER_RUPEE, todayStr } from '../lib/store.js';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import Icon, { VegMark } from '../components/Icons.jsx';
import { ReceiptContent, downloadBill } from '../components/Receipt.jsx';

export default function BillingTab({ restaurantName, restaurantDetails }) {
  const [tables, setTables] = useLocalState('rm_tables', []);
  const [openOrders, setOpenOrders] = useLocalState('rm_open_orders', {});
  const [kotSent, setKotSent] = useLocalState('rm_kot_sent', {}); // { table: { menuId: qtyAlreadySentToKitchen } }
  const [tableMeta, setTableMeta] = useLocalState('rm_table_meta', {}); // { table: { startedAt, steward } }
  const [menu] = useSupabaseTable('menu', []);
  const [staff] = useSupabaseTable('staff', []);
  const [bills, setBills] = useSupabaseTable('bills', []);
  const [customers, setCustomers] = useSupabaseTable('customers', []);
  const [loyaltyLog, setLoyaltyLog] = useSupabaseTable('loyalty_log', []);
  const [reservations] = useSupabaseTable('reservations', []);
  const [kotTickets, setKotTickets] = useSupabaseTable('kot_tickets', []);

  const [activeTable, setActiveTable] = useState(null);
  const [search, setSearch] = useState('');
  const [gstPct, setGstPct] = useState(5);
  const [payment, setPayment] = useState('Cash');
  const [customerPhone, setCustomerPhone] = useState('');
  const [servedBy, setServedBy] = useState('');
  const [receipt, setReceipt] = useState(null); // { bill, mode }
  const [kot, setKot] = useState(null); // { table, items, ts }
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [confirmRemoveTable, setConfirmRemoveTable] = useState(null);
  const [, setTick] = useState(0);

  // Keeps the per-table "Xm" elapsed-time badge live without needing any
  // other state to change.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const items = activeTable ? openOrders[activeTable] || [] : [];
  const subtotal = items.reduce((s, o) => s + o.price * o.qty, 0);
  const gst = (subtotal * gstPct) / 100;
  const total = subtotal + gst;
  const roundedTotal = Math.round(total);
  const roundOff = roundedTotal - total;

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
    if ((openOrders[name] || []).length > 0) { setConfirmRemoveTable(name); return; }
    doRemoveTable(name);
  }

  function doRemoveTable(name) {
    setTables((prev) => prev.filter((t) => t !== name));
    setOpenOrders((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setKotSent((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setTableMeta((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (activeTable === name) setActiveTable(null);
  }

  function addItem(menuItem) {
    if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
    if (!(openOrders[activeTable] || []).length) {
      setTableMeta((prev) => ({ ...prev, [activeTable]: { ...prev[activeTable], startedAt: Date.now() } }));
    }
    updateOrder(activeTable, (arr) => {
      const existing = arr.find((o) => o.menuId === menuItem.id);
      if (existing) return arr.map((o) => (o.menuId === menuItem.id ? { ...o, qty: o.qty + 1 } : o));
      return [...arr, { menuId: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1, veg: menuItem.veg !== false, note: '' }];
    });
  }

  function incDec(menuId, delta) {
    updateOrder(activeTable, (arr) =>
      arr
        .map((o) => (o.menuId === menuId ? { ...o, qty: o.qty + delta } : o))
        .filter((o) => o.qty > 0)
    );
  }

  function setItemNote(menuId, note) {
    updateOrder(activeTable, (arr) => arr.map((o) => (o.menuId === menuId ? { ...o, note } : o)));
  }

  function clearTable() {
    if (!activeTable) return;
    updateOrder(activeTable, () => []);
    setKotSent((prev) => {
      const next = { ...prev };
      delete next[activeTable];
      return next;
    });
    setTableMeta((prev) => {
      const next = { ...prev };
      delete next[activeTable];
      return next;
    });
  }

  // KOT only shows what's new since the last time this table was sent to the
  // kitchen - a table often orders in rounds, and reprinting the full order
  // each round would tell the kitchen to remake dishes already in progress.
  async function sendToKitchen() {
    if (!activeTable || items.length === 0) { alert('Order khaali hai.'); return; }
    const alreadySent = kotSent[activeTable] || {};
    const newItems = items
      .map((o) => ({ ...o, qty: o.qty - (alreadySent[o.menuId] || 0) }))
      .filter((o) => o.qty > 0);
    if (newItems.length === 0) { alert('Is order mein kitchen ke liye koi naya item nahi hai.'); return; }

    const ts = Date.now();
    setKot({ table: activeTable, items: newItems, ts, isReorder: Object.keys(alreadySent).length > 0 });
    setKotSent((prev) => ({
      ...prev,
      [activeTable]: Object.fromEntries(items.map((o) => [o.menuId, o.qty]))
    }));

    // Also push a ticket to Supabase so the Kitchen Display screen (a
    // separate device) sees it live - localStorage kotSent above is only
    // for this device's "what's already fired" bookkeeping.
    await dbInsert('kot_tickets', {
      id: uid(),
      tableName: activeTable,
      items: newItems.map((o) => ({ name: o.name, qty: o.qty, price: o.price, note: o.note || '', veg: o.veg !== false })),
      status: 'active',
      firedAt: ts
    });
  }

  async function completeBill() {
    if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
    if (items.length === 0) { alert('Order khaali hai. Pehle items add karo.'); return; }

    const staffMember = staff.find((s) => s.id === servedBy);
    const phone = customerPhone.trim();

    const bill = {
      id: uid(),
      orderNo: await nextOrderNumber(),
      ts: Date.now(),
      table: activeTable,
      items: items.map((o) => ({ name: o.name, qty: o.qty, price: o.price })),
      subtotal, gstPct, gst, total: roundedTotal, roundOff,
      payment,
      staffId: staffMember?.id || null,
      staffName: staffMember?.name || null,
      customerId: null
    };

    if (phone) {
      const existing = customers.find((c) => c.phone === phone);
      const earned = Math.floor(roundedTotal / POINTS_PER_RUPEE);
      const customerId = existing?.id || uid();
      bill.customerId = customerId;

      setCustomers((prev) => {
        const found = prev.find((c) => c.id === customerId);
        if (found) {
          return prev.map((c) => (c.id === customerId ? { ...c, visits: c.visits + 1, totalSpent: c.totalSpent + roundedTotal, points: c.points + earned } : c));
        }
        return [...prev, { id: customerId, name: '', phone, joinDate: new Date().toISOString().slice(0, 10), visits: 1, totalSpent: roundedTotal, points: earned }];
      });

      if (earned > 0) {
        setLoyaltyLog((prev) => [...prev, { id: uid(), customerId, customerName: existing?.name || phone, date: new Date().toISOString().slice(0, 10), type: 'earn', points: earned, note: `Bill - Table ${activeTable}` }]);
      }
    }

    setBills((prev) => [...prev, bill]);
    updateOrder(activeTable, () => []);
    setKotSent((prev) => {
      const next = { ...prev };
      delete next[activeTable];
      return next;
    });
    setKotTickets(kotTickets.map((k) => (k.tableName === activeTable && k.status !== 'served' ? { ...k, status: 'served' } : k)));
    setTableMeta((prev) => {
      const next = { ...prev };
      delete next[activeTable];
      return next;
    });
    setCustomerPhone('');
    setServedBy('');
    setReceipt({ bill, mode: 'print' });
  }

  function selectTable(t) {
    setActiveTable(t);
    setServedBy(tableMeta[t]?.stewardId || '');
  }

  const filteredMenu = menu.filter((m) => m.available !== false && m.name.toLowerCase().includes(search.toLowerCase()));

  const occupiedCount = tables.filter((t) => (openOrders[t] || []).length > 0).length;
  const kotRunningCount = tables.filter((t) => Object.keys(kotSent[t] || {}).length > 0).length;
  const todayRevenue = bills.filter((b) => new Date(b.ts).toISOString().slice(0, 10) === todayStr()).reduce((s, b) => s + b.total, 0);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-lg font-bold m-0">Floor / Table Status</h2>
        <button onClick={() => setAddTableOpen(true)} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-dark">+ Table</button>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap text-xs font-semibold mb-4 bg-ink text-white rounded-lg px-3.5 py-2.5">
        <span className="uppercase text-white/60 tracking-wide">Floor Live Status:</span>
        <span className="px-2 py-0.5 rounded-full bg-white/15">All Tables {tables.length}</span>
        <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(254,243,199,0.25)' }}>● Occupied {occupiedCount}</span>
        <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,252,231,0.25)' }}>● Vacant {tables.length - occupiedCount}</span>
        <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(254,226,226,0.25)' }}>● KOT Running {kotRunningCount}</span>
        <span className="flex-1" />
        <span className="text-white/60">Today's Gross:</span>
        <span className="text-white">{rupee(todayRevenue)}</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 mb-5">
        {tables.map((t) => {
          const tableItems = openOrders[t] || [];
          const hasOrder = tableItems.length > 0;
          const tableTotal = tableItems.reduce((s, o) => s + o.price * o.qty, 0);
          const kotFired = Object.keys(kotSent[t] || {}).length > 0;
          const todaysReservation = reservations.find((r) => r.table === t && r.date === todayStr() && r.status === 'upcoming');
          const isActive = t === activeTable;
          const meta = tableMeta[t];
          const steward = meta?.stewardId ? staff.find((s) => s.id === meta.stewardId)?.name : null;
          const elapsedMin = hasOrder && meta?.startedAt ? Math.floor((Date.now() - meta.startedAt) / 60000) : null;
          return (
            <div
              key={t}
              onClick={() => selectTable(t)}
              className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all flex flex-col gap-1.5 min-h-[100px] ${
                isActive
                  ? 'bg-accent border-accent text-white shadow-tile'
                  : hasOrder
                  ? 'bg-pending-container border-pending/40 text-ink'
                  : 'bg-good-container border-good/30 text-ink'
              }`}
              style={
                !isActive
                  ? hasOrder
                    ? { background: '#FEF3C7' }
                    : { background: '#DCFCE7' }
                  : undefined
              }
            >
              <span
                className={`absolute top-1.5 right-2 text-xs font-bold opacity-60 hover:opacity-100 ${isActive ? 'text-white' : 'text-ink'}`}
                onClick={(e) => { e.stopPropagation(); removeTable(t); }}
              >
                ×
              </span>
              <div className="flex items-center justify-between">
                <span className="font-headline-sm text-lg font-extrabold leading-none">{t}</span>
                {elapsedMin !== null && (
                  <span className={`text-[0.6rem] font-bold ${isActive ? 'text-white/80' : 'text-muted'}`}>{elapsedMin}m</span>
                )}
              </div>
              <span className={`inline-flex w-fit items-center px-1.5 py-0.5 rounded-full text-[0.62rem] font-bold uppercase ${
                isActive ? 'bg-white/25 text-white' : hasOrder ? 'text-pending-text' : 'text-good-text'
              }`}>
                {hasOrder ? (kotFired ? 'KOT Sent' : 'Running') : 'Vacant'}
              </span>
              {steward && (
                <span className={`text-[0.62rem] ${isActive ? 'text-white/80' : 'text-muted'}`}>Steward: {steward}</span>
              )}
              {hasOrder && <span className="font-bold text-sm mt-auto">{rupee(tableTotal)}</span>}
              {todaysReservation && (
                <span className={`text-[0.65rem] font-bold ${isActive ? 'text-white/90' : 'text-accent-dark'}`}>
                  Reserved {todaysReservation.time}
                </span>
              )}
            </div>
          );
        })}
        {tables.length === 0 && <p className="text-muted text-sm col-span-full">Koi table nahi hai. "+ Table" se add karein.</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
            <h2 className="text-lg font-bold m-0">Menu</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item..." className="px-2.5 py-1.5 border border-border rounded-md text-sm w-full sm:w-auto" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filteredMenu.length === 0 && <div className="col-span-full text-muted text-sm text-center py-5">No items found.</div>}
            {filteredMenu.map((item) => (
              <button key={item.id} onClick={() => addItem(item)} className="border border-border rounded-lg p-2.5 text-left bg-bg hover:border-accent hover:shadow-tile active:translate-y-0.5 transition-all">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <VegMark veg={item.veg !== false} />
                  {item.name}
                </span>
                <span className="text-xs text-muted block my-0.5">{item.category}</span>
                <span className="font-bold text-accent-dark">{rupee(item.price)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 pt-4">
            <h2 className="text-lg font-bold m-0">{activeTable ? `Current Order — ${activeTable}` : 'Select a table to start order'}</h2>
          </div>
          <div className="min-h-[100px] max-h-[340px] overflow-y-auto mt-2.5 px-4">
            {items.length === 0 && (
              <div className="text-muted text-sm text-center py-5">
                {activeTable ? 'No items added yet. Click menu items to add.' : 'Table select karke items add karein.'}
              </div>
            )}

            {(() => {
              const alreadySent = kotSent[activeTable] || {};
              const sentRows = items
                .map((o) => ({ ...o, sentQty: Math.min(o.qty, alreadySent[o.menuId] || 0) }))
                .filter((o) => o.sentQty > 0);
              const newRows = items
                .map((o) => ({ ...o, newQty: o.qty - Math.min(o.qty, alreadySent[o.menuId] || 0) }))
                .filter((o) => o.newQty > 0);
              return (
                <>
                  {sentRows.length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-good uppercase mb-1.5">
                        <Icon name="kitchen" className="w-3.5 h-3.5" /> Sent to Kitchen
                      </div>
                      {sentRows.map((o) => (
                        <div key={o.menuId} className="flex items-center justify-between gap-2 py-1.5 opacity-80">
                          <span className="flex-1 text-sm flex items-center gap-1.5">
                            <VegMark veg={o.veg !== false} />
                            {o.name}
                            {o.note && <span className="text-xs italic text-muted">({o.note})</span>}
                          </span>
                          <span className="text-xs font-semibold text-muted">x{o.sentQty} • Cooking</span>
                          <span className="w-[70px] text-right font-semibold text-sm">{rupee(o.price * o.sentQty)}</span>
                          <span className="text-muted text-xs">🔒</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {newRows.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-secondary-dark uppercase mb-1.5">
                        New Punch • Pending Kitchen Fire
                      </div>
                      {newRows.map((o) => (
                        <div key={o.menuId} className="py-2 border-b border-border">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex-1 text-sm flex items-center gap-1.5">
                              <VegMark veg={o.veg !== false} />
                              {o.name}
                              <span className="px-1.5 py-0.5 rounded bg-secondary/15 text-secondary-dark text-[0.6rem] font-bold uppercase">New</span>
                            </span>
                            <div className="flex items-center gap-1.5 bg-well rounded-lg p-0.5">
                              <button onClick={() => incDec(o.menuId, -1)} className="w-7 h-7 rounded-md bg-surface shadow-card font-bold flex items-center justify-center active:scale-95">−</button>
                              <span className="w-5 text-center font-semibold">{o.newQty}</span>
                              <button onClick={() => incDec(o.menuId, 1)} className="w-7 h-7 rounded-md bg-surface shadow-card font-bold flex items-center justify-center active:scale-95">+</button>
                            </div>
                            <span className="w-[70px] text-right font-semibold">{rupee(o.price * o.newQty)}</span>
                          </div>
                          <input
                            value={o.note || ''}
                            onChange={(e) => setItemNote(o.menuId, e.target.value)}
                            placeholder="+ kitchen note (e.g. less spicy)"
                            className="mt-1 w-full text-xs px-2 py-1 border border-border rounded-md bg-well/40 placeholder:text-muted"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div className="bg-well/60 mt-3.5 px-4 pt-3 pb-1 text-sm border-t border-border">
            <div className="flex justify-between py-1 items-center">
              <span>Item Subtotal</span>
              <span className="flex items-center gap-1">
                {rupee(subtotal)}
                <span className="text-muted text-xs">(GST <input type="number" value={gstPct} onChange={(e) => setGstPct(parseFloat(e.target.value) || 0)} className="w-10 border border-border rounded px-1 text-center" />%)</span>
              </span>
            </div>
            <div className="flex justify-between py-1"><span>CGST ({(gstPct / 2).toFixed(1)}%)</span><span>{rupee(gst / 2)}</span></div>
            <div className="flex justify-between py-1"><span>SGST ({(gstPct / 2).toFixed(1)}%)</span><span>{rupee(gst / 2)}</span></div>
            <div className="flex justify-between py-1 text-xs text-muted"><span>Round off</span><span>{rupee(roundOff)}</span></div>
            <div className="flex justify-between py-2.5 border-t border-border mt-1.5 font-extrabold text-xl text-accent"><span>Net Payable</span><span>{rupee(roundedTotal)}</span></div>
          </div>

          <div className="px-4">
            {staff.length > 0 && (
              <div className="flex gap-2.5 mt-2 flex-wrap items-center text-sm">
                <label className="text-muted">Steward / Served by:</label>
                <select
                  value={servedBy}
                  onChange={(e) => {
                    setServedBy(e.target.value);
                    if (activeTable) setTableMeta((prev) => ({ ...prev, [activeTable]: { ...prev[activeTable], stewardId: e.target.value } }));
                  }}
                  className="px-2 py-1.5 border border-border rounded-md"
                >
                  <option value="">Not specified</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2.5 mt-2 flex-wrap items-center text-sm">
              <label className="text-muted">Customer phone:</label>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional - for loyalty points" className="px-2 py-1.5 border border-border rounded-md flex-1 min-w-[140px]" />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              {['Cash', 'UPI', 'Card'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPayment(mode)}
                  className={`py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    payment === mode ? 'bg-good text-white border-good' : 'bg-bg border-border text-muted'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-4 mt-3 bg-ink sticky bottom-0">
            <button onClick={clearTable} className="py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white hover:bg-white/20">Clear Table</button>
            <button onClick={sendToKitchen} className="py-2.5 rounded-lg text-sm font-semibold bg-secondary text-white hover:bg-secondary-dark">Fire KOT</button>
            <button onClick={completeBill} className="col-span-2 py-3 rounded-lg text-base font-bold bg-good text-white hover:opacity-90 shadow-tile active:translate-y-0.5">
              Settle &amp; Close Table — {rupee(roundedTotal)}
            </button>
          </div>
        </div>
      </div>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} printArea>
        {receipt && <ReceiptContent bill={receipt.bill} restaurantName={restaurantName} restaurantDetails={restaurantDetails} />}
        <ModalActions>
          <Btn variant="primary" onClick={() => window.print()}>{receipt?.mode === 'reprint' ? 'Reprint' : 'Print'}</Btn>
          <Btn onClick={() => receipt && downloadBill(receipt.bill, restaurantName, restaurantDetails)}>Download</Btn>
          <Btn onClick={() => setReceipt(null)}>Close</Btn>
        </ModalActions>
      </Modal>

      <Modal open={!!kot} onClose={() => setKot(null)} printArea>
        {kot && (
          <div className="font-mono text-sm">
            <div className="text-center font-bold text-base mb-1">KITCHEN ORDER TICKET{kot.isReorder ? ' (Add-on)' : ''}</div>
            <div className="text-center text-xs text-muted mb-2.5">
              {new Date(kot.ts).toLocaleString('en-IN')}<br />Table/Token: {kot.table}
              {kot.isReorder && <><br />Naya add hua order</>}
            </div>
            <hr className="border-dashed my-2" />
            {kot.items.map((i) => (
              <div key={i.menuId} className="mb-1">
                <div className="flex justify-between font-semibold">
                  <span>{i.name}</span><span>x{i.qty}</span>
                </div>
                {i.note && <div className="text-xs italic">Note: {i.note}</div>}
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

      <ConfirmModal
        open={!!confirmRemoveTable}
        title="Remove Table"
        message={confirmRemoveTable ? `Table "${confirmRemoveTable}" mein pending order hai. Phir bhi remove karein?` : ''}
        onConfirm={() => { doRemoveTable(confirmRemoveTable); setConfirmRemoveTable(null); }}
        onCancel={() => setConfirmRemoveTable(null)}
      />
    </section>
  );
}

