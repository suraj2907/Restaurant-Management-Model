// Raw ESC/POS byte builders for 80mm thermal printers (42-char line width).
// Deliberately not using @maxxuxx/node-printer's own receipt DSL here - we
// build our own bytes so the KOT/Bill layout matches this app's existing
// Receipt.jsx formatting exactly, and pass the finished Buffer straight to
// printer.js's print() call either way.

const ESC = 0x1b;
const GS = 0x1d;
const LINE_WIDTH = 42;

const INIT = Buffer.from([ESC, 0x40]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const FEED = (n = 1) => Buffer.from([ESC, 0x64, n]);
const CUT = Buffer.from([GS, 0x56, 0x00]);

// Thermal printers generally only reliably support a single-byte codepage
// (ASCII/CP437-ish) - non-ASCII characters (₹, smart quotes, etc.) either
// print as garbage or drop the rest of the line. Never crash on an empty/
// missing note/name; always fall back to something printable.
function safeText(value) {
  return String(value ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function line(text = '') {
  return Buffer.concat([Buffer.from(safeText(text), 'ascii'), Buffer.from('\n', 'ascii')]);
}

function divider() {
  return line('-'.repeat(LINE_WIDTH));
}

// Two columns on one line: left-aligned label, right-aligned value, padded/
// truncated to LINE_WIDTH so amounts stay aligned even with long item names.
function twoCol(left, right) {
  const l = safeText(left);
  const r = safeText(right);
  const pad = LINE_WIDTH - l.length - r.length;
  return line(pad > 0 ? l + ' '.repeat(pad) + r : `${l.slice(0, LINE_WIDTH - r.length - 1)} ${r}`);
}

export function buildKot({ title, kotId, orderNo, table, billerName, billerRole, items, isReprint }) {
  const chunks = [INIT, ALIGN_CENTER, BOLD_ON, line(title || 'KITCHEN KOT')];
  if (isReprint) chunks.push(line('*** REPRINT ***'));
  chunks.push(BOLD_OFF, ALIGN_LEFT, divider());
  if (orderNo) chunks.push(line(`ORDER: ${orderNo}`));
  chunks.push(line(`KOT: ${kotId || ''}`));
  chunks.push(line(`TABLE: ${table || ''}`));
  if (billerName) chunks.push(line(`BILLER: ${billerName}${billerRole ? ` (${billerRole})` : ''}`));
  chunks.push(line(new Date().toLocaleString('en-IN')));
  chunks.push(divider());

  for (const item of items || []) {
    chunks.push(BOLD_ON, twoCol(item.name, `x${item.qty}`), BOLD_OFF);
    if (item.note) chunks.push(line(`  Note: ${item.note}`));
  }

  chunks.push(divider(), FEED(3), CUT);
  return Buffer.concat(chunks);
}

export function buildBill({ bill, isReprint }) {
  const chunks = [INIT, ALIGN_CENTER, BOLD_ON, line('BILL')];
  if (isReprint) chunks.push(line('*** REPRINT ***'));
  chunks.push(BOLD_OFF, divider(), ALIGN_LEFT);

  if (bill.orderNo) chunks.push(line(`Order: ${bill.orderNo}`));
  chunks.push(line(`Table: ${bill.table || ''}`));
  chunks.push(line(`Date: ${bill.ts ? new Date(bill.ts).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')}`));
  if (bill.billedBy) chunks.push(line(`Billed By: ${bill.billedBy}`));
  if (bill.customerName || bill.customerPhone) {
    chunks.push(line(`Customer: ${[bill.customerName, bill.customerPhone].filter(Boolean).join(' - ')}`));
  }
  chunks.push(divider());

  chunks.push(twoCol('ITEM', 'QTY   AMOUNT'));
  for (const item of bill.items || []) {
    chunks.push(twoCol(item.name, `x${item.qty}  Rs.${(item.price * item.qty).toFixed(2)}`));
  }
  chunks.push(divider());

  chunks.push(twoCol('Subtotal', `Rs.${Number(bill.subtotal || 0).toFixed(2)}`));
  if (bill.discount > 0) chunks.push(twoCol('Discount', `-Rs.${Number(bill.discount).toFixed(2)}`));
  if (bill.deliveryCharge > 0) chunks.push(twoCol('Delivery Charge', `Rs.${Number(bill.deliveryCharge).toFixed(2)}`));
  if (bill.containerCharge > 0) chunks.push(twoCol('Container Charge', `Rs.${Number(bill.containerCharge).toFixed(2)}`));
  if (bill.serviceCharge > 0) chunks.push(twoCol('Service Charge', `Rs.${Number(bill.serviceCharge).toFixed(2)}`));
  chunks.push(twoCol('CGST', `Rs.${(Number(bill.gst || 0) / 2).toFixed(2)}`));
  chunks.push(twoCol('SGST', `Rs.${(Number(bill.gst || 0) / 2).toFixed(2)}`));
  if (bill.roundOff) chunks.push(twoCol('Round Off', `Rs.${Number(bill.roundOff).toFixed(2)}`));

  chunks.push(divider(), BOLD_ON, twoCol('TOTAL', `Rs.${Number(bill.total || 0).toFixed(2)}`), BOLD_OFF);

  if (bill.waivedOff > 0) {
    chunks.push(twoCol('Waived Off', `-Rs.${Number(bill.waivedOff).toFixed(2)}`));
    chunks.push(twoCol('Amount Collected', `Rs.${(Number(bill.total) - Number(bill.waivedOff)).toFixed(2)}`));
  }

  const paymentText = bill.payment === 'Split'
    ? ['Cash', 'Upi', 'Card'].filter((k) => bill[`${k.toLowerCase()}Amount`] > 0)
        .map((k) => `${k} Rs.${Number(bill[`${k.toLowerCase()}Amount`]).toFixed(2)}`).join(' + ') || 'Split'
    : (bill.payment || '');
  chunks.push(line(`Payment: ${paymentText}`));

  chunks.push(divider(), ALIGN_CENTER, line('Thank you, visit again!'), FEED(3), CUT);
  return Buffer.concat(chunks);
}

// Running bill - a live, not-yet-final total for a table still open.
// Must never be confused with the final paid invoice from buildBill(),
// hence the explicit "NOT A FINAL PAID BILL" marker on the slip itself.
export function buildRunningBill({ table, customerName, customerPhone, guestCount, items, subtotal, discount, gstPct, gst, deliveryCharge, containerCharge, serviceCharge, total, printedAt }) {
  const chunks = [INIT, ALIGN_CENTER, BOLD_ON, line('RUNNING BILL'), BOLD_OFF, divider(), ALIGN_LEFT];

  chunks.push(line(`TABLE: ${table || ''}`));
  if (customerName) chunks.push(line(`CUSTOMER: ${customerName}`));
  if (customerPhone) chunks.push(line(`PHONE: ${customerPhone}`));
  if (guestCount) chunks.push(line(`GUESTS: ${guestCount}`));
  chunks.push(divider());

  chunks.push(twoCol('ITEM', 'QTY   AMT'));
  for (const item of items || []) {
    chunks.push(twoCol(item.name, `x${item.qty}  ${(item.price * item.qty).toFixed(0)}`));
  }
  chunks.push(divider());

  chunks.push(twoCol('Subtotal', Number(subtotal || 0).toFixed(2)));
  if (discount > 0) chunks.push(twoCol('Discount', `-${Number(discount).toFixed(2)}`));
  chunks.push(twoCol(`GST (${gstPct || 5}%)`, Number(gst || 0).toFixed(2)));
  if (deliveryCharge > 0) chunks.push(twoCol('Delivery Charge', Number(deliveryCharge).toFixed(2)));
  if (containerCharge > 0) chunks.push(twoCol('Container Charge', Number(containerCharge).toFixed(2)));
  if (serviceCharge > 0) chunks.push(twoCol('Service Charge', Number(serviceCharge).toFixed(2)));
  chunks.push(divider(), BOLD_ON, twoCol('RUNNING TOTAL', Number(total || 0).toFixed(2)), BOLD_OFF, divider());

  chunks.push(ALIGN_CENTER, line('*** NOT A FINAL PAID BILL ***'));
  chunks.push(line(printedAt ? new Date(printedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')));
  chunks.push(FEED(3), CUT);
  return Buffer.concat(chunks);
}

// Check Items - read-only order-verification slip for a customer
// cross-check, never a bill (no prices shown at all, matching how
// CheckItemsView.jsx presents it on screen).
// Aggregated total across every KOT round plus whatever's currently
// unsent - one line per item, no "sent vs not yet sent" split (see
// getCheckItemsData in src/lib/checkItems.js, which is what actually
// builds this list before it reaches the print job).
export function buildCheckItems({ restaurantName, table, customerName, customerPhone, guestCount, items, totalQty, printedBy, printedAt }) {
  const chunks = [INIT, ALIGN_CENTER, BOLD_ON, line('CHECK ITEMS'), BOLD_OFF];
  if (restaurantName) chunks.push(line(restaurantName));
  chunks.push(divider(), ALIGN_LEFT);

  chunks.push(line(`TABLE: ${table || ''}`));
  chunks.push(line(`CUSTOMER: ${customerName || 'Walk-in'}`));
  if (customerPhone) chunks.push(line(`PHONE: ${customerPhone}`));
  if (guestCount) chunks.push(line(`GUESTS: ${guestCount}`));
  chunks.push(line(printedAt ? new Date(printedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')));
  chunks.push(divider());

  for (const item of items || []) {
    chunks.push(twoCol(item.name, `x${item.qty}`));
  }
  chunks.push(divider());
  chunks.push(BOLD_ON, line(`TOTAL QTY: ${totalQty ?? (items || []).reduce((s, i) => s + i.qty, 0)}`), BOLD_OFF);

  chunks.push(divider());
  if (printedBy) chunks.push(line(`Printed By: ${printedBy}`));
  chunks.push(ALIGN_CENTER, line('*** CUSTOMER ORDER CHECK ***'));
  chunks.push(FEED(3), CUT);
  return Buffer.concat(chunks);
}

export function buildTest({ title, printerName }) {
  const chunks = [
    INIT, ALIGN_CENTER, BOLD_ON, line(title || 'PRINTER TEST'), BOLD_OFF,
    divider(), ALIGN_LEFT,
    line(`Printer: ${printerName || ''}`),
    line(new Date().toLocaleString('en-IN')),
    divider(), ALIGN_CENTER,
    line('Printer test successful.'),
    FEED(3), CUT
  ];
  return Buffer.concat(chunks);
}
