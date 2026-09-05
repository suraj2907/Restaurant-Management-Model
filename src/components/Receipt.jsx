import { rupee } from '../lib/store.js';

export function ReceiptContent({ bill, restaurantName }) {
  const dt = new Date(bill.ts);
  return (
    <div className="font-mono text-sm">
      <div className="text-center font-bold text-base mb-1">{restaurantName}</div>
      <div className="text-center text-xs text-muted mb-2.5">
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
      <div className="flex justify-between"><span>GST ({bill.gstPct}%)</span><span>{rupee(bill.gst)}</span></div>
      <div className="flex justify-between items-center font-bold text-base bg-accent text-white rounded-lg px-2.5 py-2 my-2">
        <span>Total</span><span>{rupee(bill.total)}</span>
      </div>
      <div className="flex justify-between"><span>Payment</span><span>{bill.payment}</span></div>
      <hr className="border-dashed my-2" />
      <div className="text-center text-xs text-muted">Thank you, visit again!</div>
    </div>
  );
}

export function downloadBill(bill, restaurantName) {
  const dt = new Date(bill.ts);
  const lines = [
    restaurantName,
    ...(bill.orderNo ? [`Order #${bill.orderNo}`] : []),
    dt.toLocaleString('en-IN'),
    `Table/Token: ${bill.table}`,
    '-'.repeat(32),
    ...bill.items.map((i) => `${i.name} x${i.qty}`.padEnd(24) + rupee(i.price * i.qty).padStart(8)),
    '-'.repeat(32),
    'Subtotal'.padEnd(24) + rupee(bill.subtotal).padStart(8),
    `GST (${bill.gstPct}%)`.padEnd(24) + rupee(bill.gst).padStart(8),
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
