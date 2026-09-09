import { rupee } from '../lib/store.js';

// A split bill's `payment` is just the label 'Split' - the customer needs
// to see what they actually paid via which mode, not just that it was split.
function paymentLabel(bill) {
  if (bill.payment !== 'Split') return bill.payment;
  const parts = [];
  if (bill.cashAmount > 0) parts.push(`Cash ${rupee(bill.cashAmount)}`);
  if (bill.upiAmount > 0) parts.push(`UPI ${rupee(bill.upiAmount)}`);
  if (bill.cardAmount > 0) parts.push(`Card ${rupee(bill.cardAmount)}`);
  return parts.join(' + ') || 'Split';
}

export function ReceiptContent({ bill, restaurantName, restaurantDetails }) {
  const dt = new Date(bill.ts);
  const halfGst = bill.gst / 2;
  const halfPct = (bill.gstPct / 2).toFixed(1);
  return (
    <div className="font-mono text-sm">
      <div className="text-center font-bold text-base mb-1">{restaurantName}</div>
      {restaurantDetails?.address && <div className="text-center text-xs text-muted">{restaurantDetails.address}</div>}
      {restaurantDetails?.phone && <div className="text-center text-xs text-muted">Ph: {restaurantDetails.phone}</div>}
      {restaurantDetails?.gstNumber && <div className="text-center text-xs text-muted">GSTIN: {restaurantDetails.gstNumber}</div>}
      {restaurantDetails?.fssai && <div className="text-center text-xs text-muted">FSSAI Lic No: {restaurantDetails.fssai}</div>}
      <div className="text-center text-xs text-muted mb-2.5 mt-1">
        {bill.orderNo && <>Order #{bill.orderNo}<br /></>}
        {dt.toLocaleString('en-IN')}<br />Dine In: {bill.table}
        {bill.billedBy && <><br />Cashier: {bill.billedBy}</>}
        {bill.staffName && <><br />Served by: {bill.staffName}</>}
        {(bill.customerName || bill.customerPhone) && (
          <><br />Customer: {[bill.customerName, bill.customerPhone].filter(Boolean).join(' - ')}</>
        )}
        {bill.guestName && <><br />Guest: {bill.guestName}</>}
        {bill.guestCount ? <> {bill.guestName ? '' : <br />}({bill.guestCount} pax)</> : null}
      </div>
      <hr className="border-dashed my-2" />
      {bill.items.map((i, idx) => (
        <div key={idx} className="flex justify-between"><span>{i.name} x{i.qty}</span><span>{rupee(i.price * i.qty)}</span></div>
      ))}
      <hr className="border-dashed my-2" />
      <div className="flex justify-between"><span>Subtotal</span><span>{rupee(bill.subtotal)}</span></div>
      {bill.discount > 0 && (
        <div className="flex justify-between text-bad"><span>Discount</span><span>-{rupee(bill.discount)}</span></div>
      )}
      {bill.deliveryCharge > 0 && (
        <div className="flex justify-between"><span>Delivery Charge</span><span>{rupee(bill.deliveryCharge)}</span></div>
      )}
      {bill.containerCharge > 0 && (
        <div className="flex justify-between"><span>Container Charge</span><span>{rupee(bill.containerCharge)}</span></div>
      )}
      {bill.serviceCharge > 0 && (
        <div className="flex justify-between"><span>Service Charge</span><span>{rupee(bill.serviceCharge)}</span></div>
      )}
      <div className="flex justify-between"><span>CGST ({halfPct}%)</span><span>{rupee(halfGst)}</span></div>
      <div className="flex justify-between"><span>SGST ({halfPct}%)</span><span>{rupee(halfGst)}</span></div>
      {bill.roundOff != null && Math.abs(bill.roundOff) > 0.001 && (
        <div className="flex justify-between text-xs text-muted"><span>Round off</span><span>{rupee(bill.roundOff)}</span></div>
      )}
      <div className="flex justify-between items-center font-bold text-base bg-accent text-white rounded-lg px-2.5 py-2 my-2">
        <span>Total</span><span>{rupee(bill.total)}</span>
      </div>
      {bill.waivedOff > 0 && (
        <>
          <div className="flex justify-between text-bad"><span>Waived Off</span><span>-{rupee(bill.waivedOff)}</span></div>
          <div className="flex justify-between font-bold"><span>Amount Collected</span><span>{rupee(bill.total - bill.waivedOff)}</span></div>
        </>
      )}
      <div className="flex justify-between"><span>Payment</span><span>{paymentLabel(bill)}</span></div>
      <hr className="border-dashed my-2" />
      <div className="text-center text-xs text-muted">Thank you, visit again!</div>
      {restaurantDetails?.googleReviewLink && <div className="text-center text-xs text-muted mt-1">Review us on Google</div>}
    </div>
  );
}

export function downloadBill(bill, restaurantName, restaurantDetails) {
  const dt = new Date(bill.ts);
  const halfGst = bill.gst / 2;
  const halfPct = (bill.gstPct / 2).toFixed(1);
  const lines = [
    restaurantName,
    ...(restaurantDetails?.address ? [restaurantDetails.address] : []),
    ...(restaurantDetails?.phone ? [`Ph: ${restaurantDetails.phone}`] : []),
    ...(restaurantDetails?.gstNumber ? [`GSTIN: ${restaurantDetails.gstNumber}`] : []),
    ...(restaurantDetails?.fssai ? [`FSSAI Lic No: ${restaurantDetails.fssai}`] : []),
    ...(bill.orderNo ? [`Order #${bill.orderNo}`] : []),
    dt.toLocaleString('en-IN'),
    `Dine In: ${bill.table}`,
    ...(bill.billedBy ? [`Cashier: ${bill.billedBy}`] : []),
    ...((bill.customerName || bill.customerPhone) ? [`Customer: ${[bill.customerName, bill.customerPhone].filter(Boolean).join(' - ')}`] : []),
    '-'.repeat(32),
    ...bill.items.map((i) => `${i.name} x${i.qty}`.padEnd(24) + rupee(i.price * i.qty).padStart(8)),
    '-'.repeat(32),
    'Subtotal'.padEnd(24) + rupee(bill.subtotal).padStart(8),
    ...(bill.discount > 0 ? ['Discount'.padEnd(24) + `-${rupee(bill.discount)}`.padStart(8)] : []),
    ...(bill.deliveryCharge > 0 ? ['Delivery Charge'.padEnd(24) + rupee(bill.deliveryCharge).padStart(8)] : []),
    ...(bill.containerCharge > 0 ? ['Container Charge'.padEnd(24) + rupee(bill.containerCharge).padStart(8)] : []),
    ...(bill.serviceCharge > 0 ? ['Service Charge'.padEnd(24) + rupee(bill.serviceCharge).padStart(8)] : []),
    `CGST (${halfPct}%)`.padEnd(24) + rupee(halfGst).padStart(8),
    `SGST (${halfPct}%)`.padEnd(24) + rupee(halfGst).padStart(8),
    'Total'.padEnd(24) + rupee(bill.total).padStart(8),
    ...(bill.waivedOff > 0 ? [
      'Waived Off'.padEnd(24) + `-${rupee(bill.waivedOff)}`.padStart(8),
      'Amount Collected'.padEnd(24) + rupee(bill.total - bill.waivedOff).padStart(8)
    ] : []),
    `Payment: ${paymentLabel(bill)}`,
    '-'.repeat(32),
    'Thank you, visit again!'
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bill-${bill.table}-${dt.toISOString().slice(0, 10)}-${bill.id.slice(-5)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
