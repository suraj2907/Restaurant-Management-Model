// Two different views onto the same underlying data, deliberately built
// differently:
//
// - Running Bill / Final Bill must preserve every KOT round as its own
//   line(s) - if "Cold Coffee x1" was fired in KOT1 and another
//   "Cold Coffee x1" was fired in KOT2, the bill shows two separate rows,
//   never merged into "Cold Coffee x2". getRunningBillItems()/
//   getFinalBillItems() (an alias of the same function - the final bill at
//   settlement time is exactly "everything ordered, round by round")
//   preserve that.
// - Check Items is the opposite: a customer/staff cross-check slip that
//   answers "what has this table ordered in total, right now" - it
//   aggregates every fired KOT plus whatever's punched but not yet fired
//   into one row per item, with no "not yet sent" split (an unfired item
//   is still part of what the table has currently ordered).
//
// kot_tickets.items never carry menuId (see sendToKitchen in
// BillingTab.jsx) - only name/qty/price/note/veg/station - so aggregation
// and cancellation matching are name-keyed throughout, same as before.

const DEFAULT_GST_PCT = 5;

// This table's non-cancelled KOT tickets, oldest (KOT1) first. A cancelled
// item's quantity was already subtracted from the still-active ticket's
// own qty at cancel time (see doCancelSentItem in BillingTab.jsx), so
// summing active tickets' items is already net of cancellations - the
// separate 'cancelled' tickets these tickets exclude are only kept around
// for their own audit trail (Check Items' "Cancelled" section).
function activeKotsFor(kotTickets, table) {
  return (kotTickets || [])
    .filter((k) => k.table === table && k.status !== 'cancelled' && k.status !== 'acknowledged')
    .sort((a, b) => a.firedAt - b.firedAt);
}

// Whatever's in table_state.items beyond what kotSent already accounts for
// - punched into the current round but not yet fired to the kitchen/bar.
function unsentItemsFor(tableState) {
  const items = tableState?.items || [];
  const kotSent = tableState?.kotSent || {};
  return items
    .map((o) => ({ ...o, qty: o.qty - (kotSent[o.menuId] || 0) }))
    .filter((o) => o.qty > 0);
}

// Round-preserving rows for Running Bill / Final Bill: every fired KOT's
// items in firing order, followed by whatever's still unsent - summed by
// plain addition (price * qty per row), never grouped/merged by name or
// menuId, even when the same item appears in more than one round.
export function getRunningBillItems({ tableState, kotTickets, table }) {
  const rows = [];
  for (const kot of activeKotsFor(kotTickets, table)) {
    for (const item of kot.items || []) {
      rows.push({
        menuId: item.menuId || null, name: item.name, qty: item.qty, price: item.price,
        station: item.station || 'kitchen', gstIncluded: item.gstIncluded !== false,
        kotId: kot.id, isNew: false
      });
    }
  }
  for (const item of unsentItemsFor(tableState)) {
    rows.push({
      menuId: item.menuId || null, name: item.name, qty: item.qty, price: item.price,
      station: item.station || 'kitchen', gstIncluded: item.gstIncluded !== false,
      kotId: null, isNew: true
    });
  }
  return rows;
}

// The final bill's items are constructed exactly the same way - every KOT
// round's rows plus whatever's unsent at settlement time, never merged.
export const getFinalBillItems = getRunningBillItems;

// Round-preserving rows plus every derived total Running Bill/settlement
// needs. Subtotal/GST/discount are summed across the individual rows
// above (never a groupBy-then-sum), so a duplicate row contributes its own
// amount independently rather than being folded into another row's total.
export function getRunningBillTotals({ tableState, kotTickets, table, restricted, gstPct = DEFAULT_GST_PCT }) {
  const rows = getRunningBillItems({ tableState, kotTickets, table });
  const subtotal = rows.reduce((s, o) => s + o.price * o.qty, 0);
  const gstApplicable = rows.reduce((s, o) => s + (o.gstIncluded !== false ? o.price * o.qty : 0), 0);
  const nonGstSubtotal = subtotal - gstApplicable;
  // Discount is Admin/Super-Admin only, same rule the main bill total uses.
  const discount = restricted ? 0 : Math.min(tableState?.discount || 0, gstApplicable);
  const taxableAmount = gstApplicable - discount;
  const gst = (taxableAmount * gstPct) / 100;
  const deliveryCharge = tableState?.deliveryCharge || 0;
  const containerCharge = tableState?.containerCharge || 0;
  const serviceCharge = tableState?.serviceCharge || 0;
  const total = taxableAmount + gst + nonGstSubtotal + deliveryCharge + containerCharge + serviceCharge;
  const kotCount = activeKotsFor(kotTickets, table).length;
  return { rows, subtotal, gstApplicable, nonGstSubtotal, discount, gstPct, gst, deliveryCharge, containerCharge, serviceCharge, total, kotCount };
}

// Check Items: one aggregated row per item name, summed across every fired
// KOT round PLUS whatever's currently unsent - first-seen order (an item
// that only shows up in a later round is appended after items already
// seen). No "not yet sent" split: an item punched but not yet fired is
// still part of "what this table has currently ordered".
export function getCheckItemsData({ tableState, kotTickets, table }) {
  const tableKots = (kotTickets || []).filter((k) => k.table === table);
  const activeKots = activeKotsFor(kotTickets, table);
  const cancelledKots = tableKots.filter((k) => k.status === 'cancelled');

  const totals = new Map();
  function add(name, qty, station) {
    const existing = totals.get(name);
    if (existing) existing.qty += qty;
    else totals.set(name, { name, qty, station: station || 'kitchen' });
  }
  for (const kot of activeKots) {
    for (const item of kot.items || []) add(item.name, item.qty, item.station);
  }
  for (const item of unsentItemsFor(tableState)) add(item.name, item.qty, item.station);
  const items = [...totals.values()];

  function aggregate(tickets) {
    const map = new Map();
    for (const kot of tickets) {
      for (const item of kot.items || []) {
        const existing = map.get(item.name);
        if (existing) existing.qty += item.qty;
        else map.set(item.name, { name: item.name, qty: item.qty, station: item.station || 'kitchen' });
      }
    }
    return [...map.values()];
  }
  const cancelledItems = aggregate(cancelledKots);

  const kotsSorted = tableKots.slice().sort((a, b) => b.firedAt - a.firedAt);

  return {
    table,
    customerName: tableState?.customerName || null,
    customerPhone: tableState?.customerPhone || null,
    guestCount: tableState?.guestCount || null,
    items,
    cancelledItems,
    kotCount: activeKots.length,
    totalQty: items.reduce((s, i) => s + i.qty, 0),
    kots: kotsSorted
  };
}
