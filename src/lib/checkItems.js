// Aggregates a table's actual sent order from its permanent kot_tickets
// history (never from table_state alone) - kot_tickets is the source of
// truth for "what has really gone to the kitchen/bar", since table_state
// items can legitimately include quantity that's been punched but not
// yet fired (see BillingTab's sentRows/newRows split, the same underlying
// distinction this helper generalizes for a full customer-facing check).
//
// kot_tickets items only ever carry `name` (no menuId - see sendToKitchen
// in BillingTab.jsx), so aggregation here is name-keyed throughout.
export function getCheckItemsData({ tableState, kotTickets, table }) {
  const tableKots = (kotTickets || []).filter((k) => k.table === table);
  const activeKots = tableKots.filter((k) => k.status !== 'cancelled' && k.status !== 'acknowledged');
  const cancelledKots = tableKots.filter((k) => k.status === 'cancelled');

  function aggregate(tickets) {
    const map = new Map();
    for (const kot of tickets) {
      for (const item of kot.items || []) {
        const key = item.name;
        const existing = map.get(key);
        if (existing) existing.qty += item.qty;
        else map.set(key, { name: item.name, qty: item.qty, station: item.station || 'kitchen' });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const sentItems = aggregate(activeKots);
  const cancelledItems = aggregate(cancelledKots);
  const sentByName = new Map(sentItems.map((i) => [i.name, i.qty]));

  // Anything currently in table_state.items beyond what KOT history shows
  // as sent for that name hasn't actually reached the kitchen/bar yet.
  const unsentItems = [];
  for (const item of tableState?.items || []) {
    const sentQty = sentByName.get(item.name) || 0;
    const unsentQty = item.qty - sentQty;
    if (unsentQty > 0) unsentItems.push({ name: item.name, qty: unsentQty, station: item.station || 'kitchen' });
  }

  const kotsSorted = tableKots.slice().sort((a, b) => b.firedAt - a.firedAt);

  return {
    table,
    customerName: tableState?.customerName || null,
    customerPhone: tableState?.customerPhone || null,
    guestCount: tableState?.guestCount || null,
    sentItems,
    unsentItems,
    cancelledItems,
    kotCount: activeKots.length,
    totalSentQty: sentItems.reduce((s, i) => s + i.qty, 0),
    kots: kotsSorted
  };
}
