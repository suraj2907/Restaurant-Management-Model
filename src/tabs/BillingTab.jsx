import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { nextOrderNumber, dbInsert } from '../lib/db.js';
import { uid, rupee, POINTS_PER_RUPEE, todayStr, roleLabel } from '../lib/store.js';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import Icon, { VegMark } from '../components/Icons.jsx';
import { ReceiptContent, downloadBill } from '../components/Receipt.jsx';
import QrCodesModal from '../components/QrCodesModal.jsx';

const LONG_PRESS_MS = 550;
const EMPTY_TABLE_STATE = { items: [], kotSent: {}, stewardId: null, guestCount: null, guestName: null, customerName: null, customerPhone: null, discount: 0, deliveryCharge: 0, containerCharge: 0, serviceCharge: 0, startedAt: null };

export default function BillingTab({ restaurantName, restaurantDetails, profile, restricted = false }) {
  const billerName = profile?.name || null;
  const billerRole = profile?.role || null;
  // Floor state lives in Supabase (not localStorage) so every device -
  // Captain's phone, the counter tablet - sees the same tables/orders live.
  const [tableRows, setTableRows] = useSupabaseTable('restaurant_tables', []);
  const [tableStates, setTableStates] = useSupabaseTable('table_state', []);
  const [menu] = useSupabaseTable('menu', []);
  const [staff] = useSupabaseTable('staff', []);
  const [bills, setBills] = useSupabaseTable('bills', []);
  const [customers, setCustomers] = useSupabaseTable('customers', []);
  const [loyaltyLog, setLoyaltyLog] = useSupabaseTable('loyalty_log', []);
  const [reservations] = useSupabaseTable('reservations', []);
  const [kotTickets, setKotTickets] = useSupabaseTable('kot_tickets', []);

  // QR table-ordering is a paid bonus feature, switched on per-restaurant
  // by the developer via the `subscription` row (see supabase-schema.sql
  // v11) - everything below stays invisible until that flag is on.
  const [qrEnabled, setQrEnabled] = useState(false);
  const [orderRequests, setOrderRequests] = useSupabaseTable('customer_order_requests', []);
  const [qrCodesOpen, setQrCodesOpen] = useState(false);
  useEffect(() => {
    supabase.from('subscription').select('qr_ordering_enabled').eq('id', 'main').maybeSingle()
      .then(({ data }) => setQrEnabled(!!data?.qr_ordering_enabled));
  }, []);
  const pendingOrderRequests = useMemo(() => orderRequests.filter((r) => r.status === 'pending'), [orderRequests]);

  const tables = useMemo(() => tableRows.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((t) => t.name), [tableRows]);
  function stateFor(t) {
    return tableStates.find((ts) => ts.id === t);
  }

  const [activeTable, setActiveTable] = useState(null);
  const [search, setSearch] = useState('');
  const [menuCategory, setMenuCategory] = useState('');
  const [gstPct, setGstPct] = useState(5);
  const [payment, setPayment] = useState('Cash');
  // Split payment: same bill settled across more than one mode (part Cash,
  // part UPI). This restaurant doesn't take card at all, so "Card" isn't
  // offered as a mode - `cardAmount` on the bill always stays 0, kept only
  // so the schema/downstream reports don't need special-casing.
  const [splitPayment, setSplitPayment] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [waivedOffInput, setWaivedOffInput] = useState(''); // settlement-time round-down, e.g. ₹720 bill settled for ₹700
  // Delivery/Container/Service charge are opt-in per bill (most bills use
  // none) - checkbox visibility only, the actual amount still lives in
  // table_state so it survives table shifts.
  const [showDeliveryCharge, setShowDeliveryCharge] = useState(false);
  const [showContainerCharge, setShowContainerCharge] = useState(false);
  const [showServiceCharge, setShowServiceCharge] = useState(false);
  const [servedBy, setServedBy] = useState('');
  const [receipt, setReceipt] = useState(null); // { bill, mode }
  const [kot, setKot] = useState(null); // { table, items, ts }
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [shiftTableFor, setShiftTableFor] = useState(null); // table name whose whole order is being shifted
  const [shiftItemFor, setShiftItemFor] = useState(null); // { table, menuId, name }
  const [confirmCancelItem, setConfirmCancelItem] = useState(null); // { menuId, sentQty, name, station }
  const [customerPromptFor, setCustomerPromptFor] = useState(null); // table name, when it's a fresh (vacant) table
  const [, setTick] = useState(0);

  const pressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);

  // Keeps the per-table "Xm" elapsed-time badge live without needing any
  // other state to change.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const activeState = activeTable ? stateFor(activeTable) : null;
  const items = activeState?.items || [];
  const subtotal = items.reduce((s, o) => s + o.price * o.qty, 0);
  // Items marked "GST Included" (Menu Setup) get taxed; items like Red
  // Bull/soft drinks bought without a GST invoice are flagged non-GST and
  // pass straight into the total untaxed, instead of the whole bill being
  // taxed as one uniform block.
  const gstApplicableSubtotal = items.reduce((s, o) => s + (o.gstIncluded !== false ? o.price * o.qty : 0), 0);
  const nonGstSubtotal = subtotal - gstApplicableSubtotal;
  const discount = activeState?.discount || 0;
  const effectiveDiscount = restricted ? 0 : Math.min(discount, gstApplicableSubtotal); // discount is Admin/Super-Admin only
  const taxableAmount = gstApplicableSubtotal - effectiveDiscount;
  const gst = (taxableAmount * gstPct) / 100;
  // Delivery/container/service charges - mainly for parcel & delivery
  // orders - are flat additions on top of the GST-inclusive amount, not
  // taxed further (this app doesn't model multi-rate/per-charge GST).
  const deliveryCharge = activeState?.deliveryCharge || 0;
  const containerCharge = activeState?.containerCharge || 0;
  const serviceCharge = activeState?.serviceCharge || 0;
  const extraCharges = deliveryCharge + containerCharge + serviceCharge;
  const total = taxableAmount + gst + nonGstSubtotal + extraCharges;
  const roundedTotal = Math.round(total);
  const roundOff = roundedTotal - total;

  const splitSum = (parseFloat(splitCash) || 0) + (parseFloat(splitUpi) || 0);
  const splitRemaining = roundedTotal - splitSum;
  const splitBalanced = Math.abs(splitRemaining) < 1;

  // Mirrors the per-card status pill in the grid (VACANT/RUNNING/KOT Sent),
  // computed here too since the detail view's header needs it outside the
  // grid's own map loop.
  const activeKotFired = Object.keys(activeState?.kotSent || {}).length > 0;
  const activeElapsedMin = items.length > 0 && activeState?.startedAt ? Math.floor((Date.now() - activeState.startedAt) / 60000) : null;

  // Writes one table's state, creating the row if it didn't exist yet.
  // Rows are only ever removed explicitly (clearTable/completeBill) - not
  // just because items happens to be empty right now, since customer
  // details can legitimately be captured before the first item is added.
  function patchTableState(tableName, patch) {
    setTableStates((prev) => {
      const existing = prev.find((ts) => ts.id === tableName);
      const base = existing || { id: tableName, tableName, ...EMPTY_TABLE_STATE };
      const resolved = typeof patch === 'function' ? patch(base) : patch;
      const merged = { ...base, ...resolved, id: tableName, tableName };
      return existing ? prev.map((ts) => (ts.id === tableName ? merged : ts)) : [...prev, merged];
    });
  }

  function addTable(name) {
    const clean = (name || '').trim();
    if (!clean) return;
    if (tables.includes(clean)) { alert('Ye table already exist karta hai.'); return; }
    setTableRows([...tableRows, { id: clean, name: clean, sortOrder: tableRows.length }]);
    setActiveTable(clean);
    setServedBy('');
    setCustomerPhone('');
    setCustomerPromptFor(clean);
    setAddTableOpen(false);
  }

  // A customer's self-order (via QR) lands here as a pending request, never
  // straight into table_state - staff merges it into the real order (or
  // rejects it) with one tap, same as any other item add.
  function acceptOrderRequest(req) {
    patchTableState(req.table, (base) => {
      const nextItems = [...base.items];
      for (const reqItem of req.items) {
        const idx = nextItems.findIndex((o) => o.menuId === reqItem.menuId);
        if (idx >= 0) nextItems[idx] = { ...nextItems[idx], qty: nextItems[idx].qty + reqItem.qty };
        else nextItems.push({ ...reqItem });
      }
      return { items: nextItems, startedAt: base.startedAt || Date.now() };
    });
    setOrderRequests(orderRequests.map((r) => (r.id === req.id ? { ...r, status: 'accepted' } : r)));
  }

  function rejectOrderRequest(req) {
    setOrderRequests(orderRequests.map((r) => (r.id === req.id ? { ...r, status: 'rejected' } : r)));
  }

  function addItem(menuItem) {
    if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
    patchTableState(activeTable, (base) => {
      const existing = base.items.find((o) => o.menuId === menuItem.id);
      const nextItems = existing
        ? base.items.map((o) => (o.menuId === menuItem.id ? { ...o, qty: o.qty + 1 } : o))
        : [...base.items, { menuId: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1, veg: menuItem.veg !== false, note: '', station: menuItem.station || 'kitchen', gstIncluded: menuItem.gstIncluded !== false }];
      return { items: nextItems, startedAt: base.startedAt || Date.now() };
    });
  }

  function incDec(menuId, delta) {
    patchTableState(activeTable, (base) => ({
      items: base.items.map((o) => (o.menuId === menuId ? { ...o, qty: o.qty + delta } : o)).filter((o) => o.qty > 0)
    }));
  }

  function setItemNote(menuId, note) {
    patchTableState(activeTable, (base) => ({ items: base.items.map((o) => (o.menuId === menuId ? { ...o, note } : o)) }));
  }

  function clearTable() {
    if (!activeTable) return;
    setTableStates(tableStates.filter((ts) => ts.id !== activeTable));
  }

  // KOT only shows what's new since the last time this table was sent to the
  // kitchen - a table often orders in rounds, and reprinting the full order
  // each round would tell the kitchen to remake dishes already in progress.
  async function sendToKitchen() {
    if (!activeTable || items.length === 0) { alert('Order khaali hai.'); return; }
    const alreadySent = activeState?.kotSent || {};
    const newItems = items
      .map((o) => ({ ...o, qty: o.qty - (alreadySent[o.menuId] || 0) }))
      .filter((o) => o.qty > 0);
    if (newItems.length === 0) { alert('Is order mein kitchen ke liye koi naya item nahi hai.'); return; }

    const ts = Date.now();
    setKot({ table: activeTable, items: newItems, ts, isReorder: Object.keys(alreadySent).length > 0, billerName, billerRole });
    patchTableState(activeTable, { kotSent: Object.fromEntries(items.map((o) => [o.menuId, o.qty])) });

    // Also push a ticket to Supabase so the Kitchen Display screen (a
    // separate device) sees it live.
    await dbInsert('kot_tickets', {
      id: uid(),
      table: activeTable,
      items: newItems.map((o) => ({ name: o.name, qty: o.qty, price: o.price, note: o.note || '', veg: o.veg !== false, station: o.station || 'kitchen' })),
      status: 'active',
      firedAt: ts,
      billerName,
      billerRole
    });
  }

  // Only Admin/Super Admin can cancel an item already fired to the kitchen
  // (see `restricted` guard on the button itself) - a Captain has to ask.
  // Confirmation goes through the app's own ConfirmModal rather than the
  // native browser confirm() - confirm() is unreliable on mobile browsers
  // and can get silently blocked, which made the button look broken.
  function cancelSentItem(menuId, sentQty, name, station) {
    if (restricted || !activeTable) return;
    setConfirmCancelItem({ menuId, sentQty, name, station });
  }

  // Strips the cancelled qty out of whichever already-fired ticket(s) it
  // came from (so Kitchen Display's "Cooking" list stops showing it) and
  // separately inserts a 'cancelled' ticket (so Kitchen Display can raise
  // a distinct red alert - the kitchen may have already started on it).
  async function doCancelSentItem() {
    if (!confirmCancelItem || !activeTable) return;
    const { menuId, sentQty, name, station } = confirmCancelItem;
    patchTableState(activeTable, (base) => {
      const nextKotSent = { ...base.kotSent };
      delete nextKotSent[menuId];
      return {
        items: base.items.map((o) => (o.menuId === menuId ? { ...o, qty: o.qty - sentQty } : o)).filter((o) => o.qty > 0),
        kotSent: nextKotSent
      };
    });
    setConfirmCancelItem(null);

    let remaining = sentQty;
    const relevant = kotTickets
      .filter((k) => k.table === activeTable && k.status === 'active')
      .sort((a, b) => a.firedAt - b.firedAt);
    const updatesById = new Map();
    for (const k of relevant) {
      if (remaining <= 0) break;
      const idx = (k.items || []).findIndex((i) => i.name === name);
      if (idx === -1) continue;
      const take = Math.min(k.items[idx].qty, remaining);
      remaining -= take;
      const nextItems = k.items
        .map((i, ix) => (ix === idx ? { ...i, qty: i.qty - take } : i))
        .filter((i) => i.qty > 0);
      updatesById.set(k.id, { items: nextItems, status: nextItems.length === 0 ? 'served' : k.status });
    }
    if (updatesById.size) {
      setKotTickets(kotTickets.map((k) => (updatesById.has(k.id) ? { ...k, ...updatesById.get(k.id) } : k)));
    }

    await dbInsert('kot_tickets', {
      id: uid(),
      table: activeTable,
      items: [{ name, qty: sentQty, station: station || 'kitchen' }],
      status: 'cancelled',
      firedAt: Date.now(),
      billerName,
      billerRole
    });
  }

  // Moves a whole table's order (+ fired-KOT bookkeeping) to a different
  // table - e.g. a guest asks to move seats mid-meal. Works on any table,
  // not just the currently active one (long-press on any tile can trigger
  // this). If the target already has an order, the two orders merge rather
  // than being blocked - two parties combining onto one table is normal.
  function shiftTable(from, target) {
    if (!from || !target || target === from) return;
    const source = stateFor(from);
    if (!source) return;
    const dest = stateFor(target) || { ...EMPTY_TABLE_STATE };

    const mergedItems = dest.items.map((o) => ({ ...o }));
    for (const o of source.items) {
      const idx = mergedItems.findIndex((x) => x.menuId === o.menuId);
      if (idx >= 0) mergedItems[idx] = { ...mergedItems[idx], qty: mergedItems[idx].qty + o.qty };
      else mergedItems.push(o);
    }
    const mergedKotSent = { ...dest.kotSent };
    for (const [menuId, qty] of Object.entries(source.kotSent || {})) {
      mergedKotSent[menuId] = (mergedKotSent[menuId] || 0) + qty;
    }

    setTableStates((prev) => {
      const next = prev.filter((ts) => ts.id !== from && ts.id !== target);
      next.push({
        id: target, tableName: target,
        items: mergedItems, kotSent: mergedKotSent,
        stewardId: dest.stewardId || source.stewardId,
        guestCount: dest.guestCount || source.guestCount,
        guestName: dest.guestName || source.guestName,
        customerName: dest.customerName || source.customerName,
        customerPhone: dest.customerPhone || source.customerPhone,
        discount: (dest.discount || 0) + (source.discount || 0),
        deliveryCharge: (dest.deliveryCharge || 0) + (source.deliveryCharge || 0),
        containerCharge: (dest.containerCharge || 0) + (source.containerCharge || 0),
        serviceCharge: (dest.serviceCharge || 0) + (source.serviceCharge || 0),
        startedAt: dest.startedAt || source.startedAt
      });
      return next;
    });

    const movedTicketIds = kotTickets.filter((k) => k.table === from && k.status !== 'served').map((k) => k.id);
    if (movedTicketIds.length) {
      setKotTickets(kotTickets.map((k) => (movedTicketIds.includes(k.id) ? { ...k, table: target } : k)));
    }
    if (activeTable === from) setActiveTable(target);
    setShiftTableFor(null);
  }

  // Moves just one item line to a different table (e.g. a guest takes one
  // dish with them when they move seats, rest of the order stays put). The
  // moved item merges into the target's qty for that item if it's already
  // there. Kitchen already has it cooking either way, so no KOT re-fire is
  // needed - this only affects which table it bills to.
  function shiftItem(fromTable, menuId, target) {
    if (!fromTable || !target || target === fromTable) return;
    const source = stateFor(fromTable);
    const item = source?.items.find((o) => o.menuId === menuId);
    if (!item) return;
    const dest = stateFor(target) || { ...EMPTY_TABLE_STATE };

    const remainingSourceItems = source.items.filter((o) => o.menuId !== menuId);
    const sourceKotSent = { ...source.kotSent };
    const movedSentQty = sourceKotSent[menuId] || 0;
    delete sourceKotSent[menuId];

    const destItems = dest.items.map((o) => ({ ...o }));
    const idx = destItems.findIndex((o) => o.menuId === menuId);
    if (idx >= 0) destItems[idx] = { ...destItems[idx], qty: destItems[idx].qty + item.qty };
    else destItems.push(item);
    const destKotSent = { ...dest.kotSent };
    if (movedSentQty > 0) destKotSent[menuId] = (destKotSent[menuId] || 0) + movedSentQty;

    setTableStates((prev) => {
      const next = prev.filter((ts) => ts.id !== fromTable && ts.id !== target);
      // Keep the source row even if it's now itemless - steward/guest/
      // customer details captured on that table shouldn't vanish just
      // because its last item moved elsewhere.
      next.push({ ...source, id: fromTable, tableName: fromTable, items: remainingSourceItems, kotSent: sourceKotSent });
      next.push({
        id: target, tableName: target, items: destItems, kotSent: destKotSent,
        stewardId: dest.stewardId, guestCount: dest.guestCount, guestName: dest.guestName,
        customerName: dest.customerName, customerPhone: dest.customerPhone,
        discount: dest.discount || 0,
        deliveryCharge: dest.deliveryCharge || 0, containerCharge: dest.containerCharge || 0, serviceCharge: dest.serviceCharge || 0,
        startedAt: dest.startedAt || Date.now()
      });
      return next;
    });
    setShiftItemFor(null);
  }

  async function completeBill() {
    if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
    if (items.length === 0) { alert('Order khaali hai. Pehle items add karo.'); return; }
    if (splitPayment && !splitBalanced) { alert('Split payment ka total bill amount ke barabar hona chahiye.'); return; }

    const staffMember = staff.find((s) => s.id === servedBy);
    const phone = customerPhone.trim();
    const waivedOff = restricted ? 0 : Math.max(0, Math.min(parseFloat(waivedOffInput) || 0, roundedTotal)); // waiving is Admin/Super-Admin only, same as discount

    // Every bill carries all three amounts regardless of whether it was
    // split - a single-mode bill just has one of them equal to the total -
    // so Cash Audit/Dashboard never need to branch on split-or-not.
    const cashAmount = splitPayment ? (parseFloat(splitCash) || 0) : (payment === 'Cash' ? roundedTotal : 0);
    const upiAmount = splitPayment ? (parseFloat(splitUpi) || 0) : (payment === 'UPI' ? roundedTotal : 0);
    const cardAmount = 0;

    const bill = {
      id: uid(),
      orderNo: await nextOrderNumber(),
      ts: Date.now(),
      table: activeTable,
      items: items.map((o) => ({ name: o.name, qty: o.qty, price: o.price })),
      subtotal, gstPct, gst, discount: effectiveDiscount, deliveryCharge, containerCharge, serviceCharge, waivedOff, total: roundedTotal, roundOff,
      payment: splitPayment ? 'Split' : payment,
      cashAmount, upiAmount, cardAmount,
      staffId: staffMember?.id || null,
      staffName: staffMember?.name || null,
      billedBy: billerName,
      customerId: null,
      customerName: activeState?.customerName || null,
      customerPhone: phone || activeState?.customerPhone || null,
      guestCount: activeState?.guestCount ? parseInt(activeState.guestCount, 10) : null,
      guestName: activeState?.guestName || null
    };

    if (phone) {
      const existing = customers.find((c) => c.phone === phone);
      const capturedName = activeState?.customerName || '';
      const earned = Math.floor(roundedTotal / POINTS_PER_RUPEE);
      const customerId = existing?.id || uid();
      bill.customerId = customerId;

      setCustomers((prev) => {
        const found = prev.find((c) => c.id === customerId);
        if (found) {
          return prev.map((c) => (c.id === customerId ? { ...c, name: c.name || capturedName, visits: c.visits + 1, totalSpent: c.totalSpent + roundedTotal, points: c.points + earned } : c));
        }
        return [...prev, { id: customerId, name: capturedName, phone, joinDate: new Date().toISOString().slice(0, 10), visits: 1, totalSpent: roundedTotal, points: earned }];
      });

      if (earned > 0) {
        setLoyaltyLog((prev) => [...prev, { id: uid(), customerId, customerName: existing?.name || phone, date: new Date().toISOString().slice(0, 10), type: 'earn', points: earned, note: `Bill - Table ${activeTable}` }]);
      }
    }

    setBills((prev) => [...prev, bill]);
    setTableStates(tableStates.filter((ts) => ts.id !== activeTable));
    setKotTickets(kotTickets.map((k) => (k.table === activeTable && k.status !== 'served' ? { ...k, status: 'served' } : k)));
    setCustomerPhone('');
    setServedBy('');
    setWaivedOffInput('');
    setSplitPayment(false);
    setSplitCash('');
    setSplitUpi('');
    setReceipt({ bill, mode: 'print' });
  }

  function selectTable(t) {
    setActiveTable(t);
    const st = stateFor(t);
    setServedBy(st?.stewardId || '');
    setCustomerPhone(st?.customerPhone || '');
    // These charges are opt-in checkboxes (most bills use none of them) -
    // re-show the amount input only if this table already has one set,
    // e.g. from an earlier visit or a table shift.
    setShowDeliveryCharge(!!st?.deliveryCharge);
    setShowContainerCharge(!!st?.containerCharge);
    setShowServiceCharge(!!st?.serviceCharge);
    setPayment('Cash');
    setSplitPayment(false);
    setSplitCash('');
    setSplitUpi('');
    // Fresh table (no order yet) - ask for customer details before they
    // start punching items in. Skippable - not every guest wants to share.
    if (!st) setCustomerPromptFor(t);
  }

  function saveCustomerPrompt(e) {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    if (name || phone) {
      patchTableState(customerPromptFor, { customerName: name || null, customerPhone: phone || null });
      if (phone) setCustomerPhone(phone);
      // A SECURITY DEFINER RPC (not a direct customers upsert) - a Captain
      // has billing write by default but often not the `customers`
      // resource, so a plain write here would silently fail under RLS.
      // .rpc() only implements .then() (not .catch()) and, being a
      // thenable rather than a real promise, never actually sends the
      // request unless something calls .then() on it.
      if (phone) {
        supabase.rpc('register_customer', { p_name: name, p_phone: phone })
          .then(null, (err) => console.error('register_customer failed:', err));
      }
    }
    setCustomerPromptFor(null);
  }

  // Long-press (click-and-hold, works for touch too) on any table tile
  // opens the shift picker for that table - doesn't require selecting it
  // first. A quick tap still just selects the table as before.
  function handlePressStart(t) {
    longPressFiredRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setShiftTableFor(t);
    }, LONG_PRESS_MS);
  }
  function handlePressEnd() {
    clearTimeout(pressTimerRef.current);
  }
  function handleTileClick(t) {
    if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
    selectTable(t);
  }

  // With 300+ items a flat always-visible grid made the page scroll forever -
  // browsing the full list is opt-in (search text or a category chip);
  // otherwise just Today's Special + category shortcuts show, keeping the
  // page short for the common case of searching/scanning a code.
  const menuCategories = [...new Set(menu.filter((m) => m.available !== false).map((m) => m.category))].sort();
  const browsingMenu = search.trim() !== '' || menuCategory !== '';
  const filteredMenu = menu.filter((m) => m.available !== false
    && (m.name.toLowerCase().includes(search.toLowerCase()) || (m.code && m.code.toLowerCase().includes(search.toLowerCase())))
    && (!menuCategory || m.category === menuCategory));
  const specialItems = filteredMenu.filter((m) => m.isSpecial);
  const regularItems = filteredMenu.filter((m) => !m.isSpecial);

  // Typing an item's code and pressing Enter adds it straight to the order
  // - no need to touch the grid at all once a captain knows the codes.
  function handleSearchKeyDown(e) {
    if (e.key !== 'Enter') return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const match = menu.find((m) => m.available !== false && m.code && m.code.toLowerCase() === q);
    if (match) {
      addItem(match);
      setSearch('');
    }
  }

  function MenuItemButton({ item }) {
    return (
      <button onClick={() => addItem(item)} className="border border-border rounded-lg p-2.5 text-left bg-bg hover:border-accent hover:shadow-tile active:translate-y-0.5 transition-all">
        <span className="font-semibold text-sm flex items-center gap-1.5">
          <VegMark veg={item.veg !== false} />
          {item.name}
          {item.code && <span className="px-1 py-0.5 rounded bg-well text-muted text-[0.58rem] font-mono font-bold">{item.code}</span>}
        </span>
        <span className="text-xs text-muted block my-0.5">{item.category}</span>
        <span className="font-bold text-accent-dark">{rupee(item.price)}</span>
      </button>
    );
  }

  // Reusable "pick a target table" list, used for both whole-table shift and
  // single-item shift. Any table can be picked, including occupied ones -
  // those merge instead of being blocked.
  function TablePicker({ exclude, onPick }) {
    const others = tables.filter((t) => t !== exclude);
    if (others.length === 0) return <p className="text-muted text-sm">Koi doosra table nahi hai.</p>;
    return (
      <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto">
        {others.map((t) => {
          const occupied = (stateFor(t)?.items || []).length > 0;
          return (
            <button key={t} onClick={() => onPick(t)} className="px-3 py-2.5 rounded-lg text-sm font-semibold bg-bg border border-border text-left hover:border-accent flex items-center justify-between gap-2">
              <span>{t}</span>
              {occupied && <span className="text-[0.65rem] text-pending-text font-bold uppercase">Occupied — merge hoga</span>}
            </button>
          );
        })}
      </div>
    );
  }

  const occupiedCount = tableStates.filter((ts) => (ts.items || []).length > 0).length;
  const kotRunningCount = tableStates.filter((ts) => Object.keys(ts.kotSent || {}).length > 0).length;
  const parcelCount = tables.filter((t) => t.startsWith('Parcel')).length;
  const dineInCount = tables.length - parcelCount;
  const occupiedTableNames = new Set(tableStates.filter((ts) => (ts.items || []).length > 0).map((ts) => ts.id));
  const occupiedParcelCount = tables.filter((t) => t.startsWith('Parcel') && occupiedTableNames.has(t)).length;
  const occupiedDineInCount = occupiedCount - occupiedParcelCount;
  const vacantDineInCount = dineInCount - occupiedDineInCount;
  const vacantParcelCount = parcelCount - occupiedParcelCount;
  const todayRevenue = bills.filter((b) => new Date(b.ts).toISOString().slice(0, 10) === todayStr()).reduce((s, b) => s + b.total, 0);

  return (
    <section>
      {!activeTable && (
      <>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-lg font-bold m-0">Floor / Table Status</h2>
        <div className="flex items-center gap-2">
          {qrEnabled && (
            <button onClick={() => setQrCodesOpen(true)} className="px-3 py-2 rounded-lg text-sm font-semibold bg-bg border border-border hover:text-ink flex items-center gap-1.5">
              <Icon name="qr" className="w-4 h-4" /> QR Codes
            </button>
          )}
          <button onClick={() => setAddTableOpen(true)} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-dark">+ Table</button>
        </div>
      </div>

      {qrEnabled && pendingOrderRequests.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {pendingOrderRequests.map((req) => (
            <div key={req.id} className="flex items-start gap-3 bg-secondary/10 border border-secondary rounded-lg px-3.5 py-2.5">
              <Icon name="cart" className="w-4 h-4 mt-0.5 text-secondary-dark shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink">Table {req.table} — customer se naya order</p>
                <p className="text-xs text-muted">
                  {req.items.map((i) => `${i.name} x${i.qty}`).join(', ')}
                  {req.customerName ? ` — ${req.customerName}` : ''}{req.customerPhone ? ` (${req.customerPhone})` : ''}
                </p>
                {req.note && <p className="text-xs text-muted italic">Note: {req.note}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => acceptOrderRequest(req)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-good text-white">Accept</button>
                <button onClick={() => rejectOrderRequest(req)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-bg border border-border">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-xs font-semibold mb-4 bg-ink text-white rounded-lg px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="uppercase text-white/60 tracking-wide w-14 shrink-0">Tables:</span>
          <span className="px-2 py-0.5 rounded-full bg-white/15">Total {dineInCount}</span>
          <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(254,243,199,0.25)' }}>● Occupied {occupiedDineInCount}</span>
          <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,252,231,0.25)' }}>● Vacant {vacantDineInCount}</span>
        </div>
        {parcelCount > 0 && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="uppercase text-white/60 tracking-wide w-14 shrink-0">Parcel:</span>
            <span className="px-2 py-0.5 rounded-full bg-white/15">Total {parcelCount}</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(254,243,199,0.25)' }}>● Occupied {occupiedParcelCount}</span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,252,231,0.25)' }}>● Vacant {vacantParcelCount}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(254,226,226,0.25)' }}>● KOT Running {kotRunningCount}</span>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-white/60">Today's Gross:</span>
          <span className="text-white">{rupee(todayRevenue)}</span>
        </div>
      </div>
      <p className="text-muted text-xs -mt-2.5 mb-4">Table ko dabaye rakhein (long-press) kisi doosre table mein shift karne ke liye.</p>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 mb-5">
        {tables.map((t) => {
          const ts = stateFor(t);
          const tableItems = ts?.items || [];
          const hasOrder = tableItems.length > 0;
          const tableTotal = tableItems.reduce((s, o) => s + o.price * o.qty, 0);
          const kotFired = Object.keys(ts?.kotSent || {}).length > 0;
          const todaysReservation = reservations.find((r) => r.table === t && r.date === todayStr() && r.status === 'upcoming');
          const isActive = t === activeTable;
          const steward = ts?.stewardId ? staff.find((s) => s.id === ts.stewardId)?.name : null;
          const elapsedMin = hasOrder && ts?.startedAt ? Math.floor((Date.now() - ts.startedAt) / 60000) : null;
          return (
            <div
              key={t}
              onClick={() => handleTileClick(t)}
              onMouseDown={() => handlePressStart(t)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={() => handlePressStart(t)}
              onTouchEnd={handlePressEnd}
              onContextMenu={(e) => e.preventDefault()}
              style={{ userSelect: 'none', touchAction: 'manipulation', ...((!isActive) ? (hasOrder ? { background: '#FEF3C7' } : { background: '#DCFCE7' }) : {}) }}
              className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all flex flex-col gap-1.5 min-h-[100px] ${
                isActive
                  ? 'bg-accent border-accent text-white shadow-tile'
                  : hasOrder
                  ? 'border-pending/40 text-ink'
                  : 'border-good/30 text-ink'
              }`}
            >
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
              {ts?.customerName && (
                <span className={`text-[0.62rem] ${isActive ? 'text-white/80' : 'text-muted'}`}>👤 {ts.customerName}</span>
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
      </>
      )}

      {activeTable && (
      <>
      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <button onClick={() => setActiveTable(null)} className="px-3 py-2 rounded-lg text-sm font-semibold bg-bg border border-border hover:text-ink shrink-0">
          ← Back
        </button>
        <h2 className="text-lg font-bold m-0">{activeTable}</h2>
        <span className={`inline-flex w-fit items-center px-1.5 py-0.5 rounded-full text-[0.62rem] font-bold uppercase ${items.length > 0 ? 'text-pending-text' : 'text-good-text'}`}>
          {items.length > 0 ? (activeKotFired ? 'KOT Sent' : 'Running') : 'Vacant'}
        </span>
        {activeElapsedMin !== null && <span className="text-xs text-muted font-semibold">{activeElapsedMin}m</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
            <h2 className="text-lg font-bold m-0">Menu</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Search item ya code (Enter se add)..." className="px-2.5 py-1.5 border border-border rounded-md text-sm w-full sm:w-auto" />
          </div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {menuCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setMenuCategory(menuCategory === cat ? '' : cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${menuCategory === cat ? 'bg-accent text-white border-accent' : 'bg-bg border-border text-muted hover:text-ink'}`}
              >
                {cat}
              </button>
            ))}
          </div>
          {specialItems.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-bold text-secondary-dark uppercase mb-1.5">⭐ Today's Special</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {specialItems.map((item) => <MenuItemButton key={item.id} item={item} />)}
              </div>
            </div>
          )}
          {!browsingMenu ? (
            <p className="text-muted text-sm text-center py-6">Item search karein ya upar se category chunein — 300+ items hone ki wajah se poori list yahan nahi dikhayi jaati.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredMenu.length === 0 && <div className="col-span-full text-muted text-sm text-center py-5">No items found.</div>}
              {regularItems.map((item) => <MenuItemButton key={item.id} item={item} />)}
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 pt-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold m-0">Current Order</h2>
            <button onClick={() => setShiftTableFor(activeTable)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border hover:text-ink shrink-0">
              Shift Table
            </button>
          </div>
          <div className="min-h-[100px] max-h-[340px] overflow-y-auto mt-2.5 px-4">
            {items.length === 0 && (
              <div className="text-muted text-sm text-center py-5">No items added yet. Click menu items to add.</div>
            )}

            {(() => {
              const alreadySent = activeState?.kotSent || {};
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
                          <button
                            onClick={() => setShiftItemFor({ table: activeTable, menuId: o.menuId, name: o.name })}
                            className="text-accent-dark text-xs font-bold px-1 hover:opacity-70"
                            title="Ye item doosre table mein shift karein"
                          >
                            ⇄
                          </button>
                          {restricted ? (
                            <span className="text-muted text-xs" title="Sirf Admin item cancel kar sakta hai">🔒</span>
                          ) : (
                            <button
                              onClick={() => cancelSentItem(o.menuId, o.sentQty, o.name, o.station)}
                              className="text-bad text-xs font-bold px-1.5 py-0.5 rounded hover:bg-bad/10"
                              title="Ye item cancel karein - kitchen ko alert milega"
                            >
                              Cancel
                            </button>
                          )}
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
                            <button
                              onClick={() => setShiftItemFor({ table: activeTable, menuId: o.menuId, name: o.name })}
                              className="text-accent-dark text-xs font-bold px-1 hover:opacity-70"
                              title="Ye item doosre table mein shift karein"
                            >
                              ⇄
                            </button>
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
                {!restricted && (
                  <span className="text-muted text-xs">(GST <input type="number" value={gstPct} onChange={(e) => setGstPct(parseFloat(e.target.value) || 0)} className="w-10 border border-border rounded px-1 text-center" />%)</span>
                )}
              </span>
            </div>
            {nonGstSubtotal > 0 && (
              <div className="flex justify-between py-1 text-xs text-muted"><span>Non-GST items</span><span>{rupee(nonGstSubtotal)}</span></div>
            )}
            {!restricted && (
              <div className="flex justify-between py-1 items-center">
                <span>Discount</span>
                <span className="flex items-center gap-1">
                  ₹<input type="number" min="0" value={discount} onChange={(e) => activeTable && patchTableState(activeTable, { discount: parseFloat(e.target.value) || 0 })} className="w-16 border border-border rounded px-1 text-right" />
                </span>
              </div>
            )}
            <div className="flex justify-between py-1 items-center">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox" checked={showDeliveryCharge}
                  onChange={(e) => {
                    setShowDeliveryCharge(e.target.checked);
                    if (!e.target.checked && activeTable) patchTableState(activeTable, { deliveryCharge: 0 });
                  }}
                  className="w-3.5 h-3.5"
                />
                <span>Delivery Charge</span>
              </label>
              {showDeliveryCharge && (
                <span className="flex items-center gap-1">
                  ₹<input type="number" min="0" autoFocus value={deliveryCharge || ''} onChange={(e) => activeTable && patchTableState(activeTable, { deliveryCharge: parseFloat(e.target.value) || 0 })} className="w-16 border border-border rounded px-1 text-right" />
                </span>
              )}
            </div>
            <div className="flex justify-between py-1 items-center">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox" checked={showContainerCharge}
                  onChange={(e) => {
                    setShowContainerCharge(e.target.checked);
                    if (!e.target.checked && activeTable) patchTableState(activeTable, { containerCharge: 0 });
                  }}
                  className="w-3.5 h-3.5"
                />
                <span>Container Charge</span>
              </label>
              {showContainerCharge && (
                <span className="flex items-center gap-1">
                  ₹<input type="number" min="0" autoFocus value={containerCharge || ''} onChange={(e) => activeTable && patchTableState(activeTable, { containerCharge: parseFloat(e.target.value) || 0 })} className="w-16 border border-border rounded px-1 text-right" />
                </span>
              )}
            </div>
            <div className="flex justify-between py-1 items-center">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox" checked={showServiceCharge}
                  onChange={(e) => {
                    setShowServiceCharge(e.target.checked);
                    if (!e.target.checked && activeTable) patchTableState(activeTable, { serviceCharge: 0 });
                  }}
                  className="w-3.5 h-3.5"
                />
                <span>Service Charge</span>
              </label>
              {showServiceCharge && (
                <span className="flex items-center gap-1">
                  ₹<input type="number" min="0" autoFocus value={serviceCharge || ''} onChange={(e) => activeTable && patchTableState(activeTable, { serviceCharge: parseFloat(e.target.value) || 0 })} className="w-16 border border-border rounded px-1 text-right" />
                </span>
              )}
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
                    if (activeTable) patchTableState(activeTable, { stewardId: e.target.value });
                  }}
                  className="px-2 py-1.5 border border-border rounded-md"
                >
                  <option value="">Not specified</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2.5 mt-2 flex-wrap items-center text-sm">
              <label className="text-muted">Guests:</label>
              <input
                type="number" min="0"
                value={activeState?.guestCount || ''}
                onChange={(e) => activeTable && patchTableState(activeTable, { guestCount: e.target.value })}
                placeholder="Pax" className="w-16 px-2 py-1.5 border border-border rounded-md"
              />
              <input
                value={activeState?.guestName || ''}
                onChange={(e) => activeTable && patchTableState(activeTable, { guestName: e.target.value })}
                placeholder="Guest name (optional)" className="px-2 py-1.5 border border-border rounded-md flex-1 min-w-[120px]"
              />
            </div>
            <div className="flex gap-2.5 mt-2 flex-wrap items-center text-sm">
              <label className="text-muted">Customer phone:</label>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional - for loyalty points" className="px-2 py-1.5 border border-border rounded-md flex-1 min-w-[140px]" />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              {['Cash', 'UPI'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => { setSplitPayment(false); setPayment(mode); }}
                  className={`py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    !splitPayment && payment === mode ? 'bg-good text-white border-good' : 'bg-bg border-border text-muted'
                  }`}
                >
                  {mode}
                </button>
              ))}
              <button
                onClick={() => setSplitPayment(true)}
                className={`py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  splitPayment ? 'bg-good text-white border-good' : 'bg-bg border-border text-muted'
                }`}
              >
                Split
              </button>
            </div>

            {splitPayment && (
              <div className="mt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">Cash</label>
                    <input type="number" min="0" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} placeholder="0" className="px-2 py-1.5 border border-border rounded-md text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted">UPI</label>
                    <input type="number" min="0" value={splitUpi} onChange={(e) => setSplitUpi(e.target.value)} placeholder="0" className="px-2 py-1.5 border border-border rounded-md text-sm" />
                  </div>
                </div>
                <p className={`text-xs mt-1.5 font-semibold ${splitBalanced ? 'text-good' : 'text-bad'}`}>
                  {splitBalanced ? '✓ Total match ho gaya' : splitRemaining > 0 ? `${rupee(splitRemaining)} aur baaki hai` : `${rupee(-splitRemaining)} zyada ho gaya`}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 p-4 mt-3 bg-ink sticky bottom-0">
            {!restricted && (
              <div className="col-span-2 flex items-center justify-between gap-2 text-sm text-white/80 -mt-1 mb-1">
                <span>Waived off (round down)</span>
                <span className="flex items-center gap-1">
                  ₹<input
                    type="number" min="0" max={roundedTotal}
                    value={waivedOffInput}
                    onChange={(e) => setWaivedOffInput(e.target.value)}
                    placeholder="0"
                    className="w-16 border border-white/30 bg-transparent rounded px-1 text-right text-white"
                  />
                </span>
              </div>
            )}
            <button onClick={clearTable} className="py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white hover:bg-white/20">Clear Table</button>
            <button onClick={sendToKitchen} className="py-2.5 rounded-lg text-sm font-semibold bg-secondary text-white hover:bg-secondary-dark">Fire KOT</button>
            <button
              onClick={completeBill}
              disabled={splitPayment && !splitBalanced}
              className="col-span-2 py-3 rounded-lg text-base font-bold bg-good text-white hover:opacity-90 shadow-tile active:translate-y-0.5 disabled:opacity-40 disabled:pointer-events-none"
            >
              {!restricted && parseFloat(waivedOffInput) > 0
                ? `Settle & Close Table — ${rupee(roundedTotal - Math.min(parseFloat(waivedOffInput) || 0, roundedTotal))} (${rupee(roundedTotal)} - waived)`
                : `Settle & Close Table — ${rupee(roundedTotal)}`}
            </button>
          </div>
        </div>
      </div>
      </>
      )}

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
              {new Date(kot.ts).toLocaleString('en-IN')}<br />
              {kot.billerName && <>Biller: {kot.billerName}{kot.billerRole ? ` (${roleLabel(kot.billerRole)})` : ''}<br /></>}
              Dine In &bull; Table No: {kot.table}
              {kot.isReorder && <><br />Naya add hua order</>}
            </div>
            <hr className="border-dashed my-2" />
            {kot.items.map((i) => (
              <div key={i.menuId} className="mb-1">
                <div className="flex justify-between font-semibold">
                  <span>{i.name}</span><span>x{i.qty}</span>
                </div>
                {i.note && <div className="text-xs italic">Special Note: {i.note}</div>}
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

      <Modal open={!!customerPromptFor} onClose={() => setCustomerPromptFor(null)} title="Customer Details">
        <p className="text-muted text-xs -mt-1 mb-3">Order lene se pehle — customer chahe to naam/number de sakta hai (loyalty ke liye), warna Skip kar dein.</p>
        <form onSubmit={saveCustomerPrompt}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Customer Name</label>
            <input name="name" autoFocus placeholder="e.g. Rahul" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Phone Number</label>
            <input name="phone" type="tel" placeholder="e.g. 98765 43210" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Continue</Btn>
            <Btn type="button" onClick={() => setCustomerPromptFor(null)}>Skip</Btn>
          </ModalActions>
        </form>
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

      <Modal open={!!shiftTableFor} onClose={() => setShiftTableFor(null)} title={`Shift "${shiftTableFor}" to...`}>
        <TablePicker exclude={shiftTableFor} onPick={(t) => shiftTable(shiftTableFor, t)} />
        <ModalActions>
          <Btn onClick={() => setShiftTableFor(null)}>Cancel</Btn>
        </ModalActions>
      </Modal>

      <Modal open={!!shiftItemFor} onClose={() => setShiftItemFor(null)} title={shiftItemFor ? `Shift "${shiftItemFor.name}" to...` : ''}>
        {shiftItemFor && <TablePicker exclude={shiftItemFor.table} onPick={(t) => shiftItem(shiftItemFor.table, shiftItemFor.menuId, t)} />}
        <ModalActions>
          <Btn onClick={() => setShiftItemFor(null)}>Cancel</Btn>
        </ModalActions>
      </Modal>

      <ConfirmModal
        open={!!confirmCancelItem}
        title="Item Cancel Karein"
        message={confirmCancelItem ? `"${confirmCancelItem.name}" x${confirmCancelItem.sentQty} cancel karna hai? Kitchen ko turant pata chal jayega.` : ''}
        onConfirm={doCancelSentItem}
        onCancel={() => setConfirmCancelItem(null)}
      />

      <QrCodesModal open={qrCodesOpen} onClose={() => setQrCodesOpen(false)} tableRows={tableRows} />
    </section>
  );
}
