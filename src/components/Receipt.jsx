import { rupee } from '../lib/store.js';

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
      <div className="text-center text-xs text-muted mb-2.5 mt-1">
        {bill.orderNo && <>Order #{bill.orderNo}<br /></>}
        {dt.toLocaleString('en-IN')}<br />Table/Token: {bill.table}
        {bill.staffName && <><br />Served by: {bill.staffName}</>}
      </div>
      <hr className="border-dashed my-2" />
      {bill.items.map((i, idx) => (
        <div key={idx} className="flex justify-between"><span>{i.name} x{i.qty}</span><span>{rupee(i.price * i.qty)}</span></div>
      ))}
      <hr className="border-dashed my-2" />
      <div className="flex justify-between"><span>Subtotal</span><span>{rupee(bill.subtotal)}</span></div>
      <div className="flex justify-between"><span>CGST ({halfPct}%)</span><span>{rupee(halfGst)}</span></div>
      <div className="flex justify-between"><span>SGST ({halfPct}%)</span><span>{rupee(halfGst)}</span></div>
      {bill.roundOff != null && Math.abs(bill.roundOff) > 0.001 && (
        <div className="flex justify-between text-xs text-muted"><span>Round off</span><span>{rupee(bill.roundOff)}</span></div>
      )}
      <div className="flex justify-between items-center font-bold text-base bg-accent text-white rounded-lg px-2.5 py-2 my-2">
        <span>Total</span><span>{rupee(bill.total)}</span>
      </div>
      <div className="flex justify-between"><span>Payment</span><span>{bill.payment}</span></div>
      <hr className="border-dashed my-2" />
      <div className="text-center text-xs text-muted">Thank you, visit again!</div>
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
    ...(bill.orderNo ? [`Order #${bill.orderNo}`] : []),
    dt.toLocaleString('en-IN'),
    `Table/Token: ${bill.table}`,
    '-'.repeat(32),
    ...bill.items.map((i) => `${i.name} x${i.qty}`.padEnd(24) + rupee(i.price * i.qty).padStart(8)),
    '-'.repeat(32),
    'Subtotal'.padEnd(24) + rupee(bill.subtotal).padStart(8),
    `CGST (${halfPct}%)`.padEnd(24) + rupee(halfGst).padStart(8),
    `SGST (${halfPct}%)`.padEnd(24) + rupee(halfGst).padStart(8),
    'Total'.padEnd(24) + rupee(bill.total).padStart(8),
    `Payment: ${bill.payment}`,
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
