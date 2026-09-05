import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

function whatsappReminderLink(phone, name, amount) {
  const digits = (phone || '').replace(/\D/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  const text = encodeURIComponent(`Namaste ${name || ''}, aapka ${rupee(amount)} udhar pending hai humare restaurant mein. Kripya jald settle kar dijiyega. Dhanyawad!`);
  return `https://wa.me/${number}?text=${text}`;
}

export default function CustomersTab() {
  const [customers, setCustomers, customersLoaded] = useSupabaseTable('customers', []);
  const [loyaltyLog, setLoyaltyLog] = useSupabaseTable('loyalty_log', []);
  const [credit, setCredit] = useSupabaseTable('customer_credit', []);
  const [bills] = useSupabaseTable('bills', []);
  const [adjustModal, setAdjustModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [editCustomer, setEditCustomer] = useState(null);
  const [udharModal, setUdharModal] = useState(null);

  function addCustomer(e) {
    e.preventDefault();
    const f = e.target;
    const phone = f.phone.value.trim();
    if (customers.some((c) => c.phone === phone)) {
      alert('Is phone number se customer already exist karta hai.');
      return;
    }
    setCustomers([
      ...customers,
      { id: uid(), name: f.name.value.trim(), phone, joinDate: todayStr(), visits: 0, totalSpent: 0, points: 0 }
    ]);
    f.reset();
  }

  function saveAdjust(e) {
    e.preventDefault();
    const f = e.target;
    const type = f.type.value;
    const points = parseInt(f.points.value, 10);
    const note = f.note.value.trim();
    if (!points || points <= 0) return;
    const delta = type === 'redeem' ? -points : points;

    setCustomers(customers.map((c) => (c.id === adjustModal.id ? { ...c, points: Math.max(0, c.points + delta) } : c)));
    setLoyaltyLog([
      ...loyaltyLog,
      { id: uid(), customerId: adjustModal.id, customerName: adjustModal.name || adjustModal.phone, date: todayStr(), type, points, note }
    ]);
    setAdjustModal(null);
  }

  function saveEditCustomer(e) {
    e.preventDefault();
    const f = e.target;
    const phone = f.phone.value.trim();
    if (customers.some((c) => c.id !== editCustomer.id && c.phone === phone)) {
      alert('Is phone number se doosra customer already exist karta hai.');
      return;
    }
    setCustomers(customers.map((c) => (c.id === editCustomer.id ? { ...c, name: f.name.value.trim(), phone } : c)));
    setEditCustomer(null);
  }

  function saveUdhar(e) {
    e.preventDefault();
    const f = e.target;
    const type = f.type.value;
    const amount = parseFloat(f.amount.value);
    const note = f.note.value.trim();
    if (!amount || amount <= 0) return;
    setCredit([
      ...credit,
      { id: uid(), customerId: udharModal.id, customerName: udharModal.name || udharModal.phone, date: todayStr(), type, amount, note }
    ]);
    setUdharModal(null);
  }

  function udharBalance(customerId) {
    const charged = credit.filter((u) => u.customerId === customerId && u.type === 'charge').reduce((s, u) => s + u.amount, 0);
    const settled = credit.filter((u) => u.customerId === customerId && u.type === 'payment').reduce((s, u) => s + u.amount, 0);
    return charged - settled;
  }

  const sortedCustomers = useMemo(() => customers.slice().sort((a, b) => b.totalSpent - a.totalSpent), [customers]);
  const customerRows = useMemo(() => sortedCustomers.map((c) => ({ ...c, udhar: udharBalance(c.id) })), [sortedCustomers, credit]);

  return (
    <section>
      <h2 className="text-lg font-bold mb-3.5">Customers, Loyalty &amp; Udhar</h2>
      <p className="text-muted text-sm -mt-1 mb-3.5">
        Billing tab mein customer ka phone number daalne se automatically visits, spend aur points (₹100 = 1 point) track ho jaate hain. Udhar khata yahan se manually log karein.
      </p>
      <form onSubmit={addCustomer} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Customer name" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="phone" required placeholder="Phone number" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Customer</button>
      </form>

      <TableScroll>
        <DataTable columns={['Name', 'Phone', 'Visits', 'Total Spent', 'Points', 'Udhar Due', 'Actions']}>
          {!customersLoaded && <SkeletonRows rows={4} cols={7} />}
          {customersLoaded && customerRows.length === 0 && <EmptyRow span={7}>Koi customer add nahi kiya abhi.</EmptyRow>}
          {customersLoaded && customerRows.map((c) => (
              <tr key={c.id}>
                <td className={td}>{c.name || <span className="text-muted italic">Unnamed</span>}</td>
                <td className={td}>{c.phone}</td>
                <td className={td}>{c.visits}</td>
                <td className={td}>{rupee(c.totalSpent)}</td>
                <td className={td}>{c.points}</td>
                <td className={td}>
                  {c.udhar > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-bad/10 text-bad text-xs font-bold">{rupee(c.udhar)}</span>
                  ) : '-'}
                </td>
                <td className={`${td} space-x-2 whitespace-nowrap`}>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setUdharModal(c)}>
                    Udhar
                  </button>
                  {c.udhar > 0 && c.phone && (
                    <a
                      href={whatsappReminderLink(c.phone, c.name, c.udhar)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-md text-xs font-semibold bg-good/10 text-good inline-block"
                    >
                      WhatsApp Reminder
                    </a>
                  )}
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setAdjustModal(c)}>
                    Adjust Points
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setHistoryModal(c)}>
                    History
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditCustomer(c)}>
                    Edit
                  </button>
                  <button className="text-bad underline text-sm" onClick={() => setCustomers(customers.filter((x) => x.id !== c.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
        </DataTable>
      </TableScroll>

      <Modal open={!!udharModal} onClose={() => setUdharModal(null)} title={udharModal ? `Udhar Khata — ${udharModal.name || udharModal.phone}` : ''}>
        {udharModal && (
          <>
            <p className="text-sm mb-3">Current balance: <strong className={udharBalance(udharModal.id) > 0 ? 'text-bad' : 'text-good'}>{rupee(udharBalance(udharModal.id))}</strong></p>
            <form onSubmit={saveUdhar}>
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-xs text-muted font-semibold">Type</label>
                <select name="type" defaultValue="charge" className="px-2.5 py-2 border border-border rounded-md text-sm">
                  <option value="charge">Udhar Diya (customer ne udhaar liya)</option>
                  <option value="payment">Udhar Wasooli (customer ne chukaya)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-xs text-muted font-semibold">Amount</label>
                <input name="amount" type="number" step="0.01" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
              </div>
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-xs text-muted font-semibold">Note</label>
                <input name="note" placeholder="e.g. Family dinner, bill unpaid" className="px-2.5 py-2 border border-border rounded-md text-sm" />
              </div>
              <ModalActions>
                <Btn variant="primary" type="submit">Save</Btn>
                <Btn type="button" onClick={() => setUdharModal(null)}>Cancel</Btn>
              </ModalActions>
            </form>
          </>
        )}
      </Modal>

      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title={adjustModal ? `Adjust Points — ${adjustModal.name || adjustModal.phone}` : ''}>
        <form onSubmit={saveAdjust}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Type</label>
            <select name="type" defaultValue="redeem" className="px-2.5 py-2 border border-border rounded-md text-sm">
              <option value="redeem">Redeem (subtract points)</option>
              <option value="earn">Bonus (add points)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Points</label>
            <input name="points" type="number" step="1" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. Redeemed for free dessert" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Save</Btn>
            <Btn type="button" onClick={() => setAdjustModal(null)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={historyModal ? `History — ${historyModal.name || historyModal.phone}` : ''} wide>
        {historyModal && (() => {
          const purchases = bills.filter((b) => b.customerId === historyModal.id).sort((a, b) => b.ts - a.ts);
          const pointsLog = loyaltyLog.filter((l) => l.customerId === historyModal.id).sort((a, b) => b.date.localeCompare(a.date));
          const udharLog = credit.filter((u) => u.customerId === historyModal.id).sort((a, b) => b.date.localeCompare(a.date));
          return (
            <>
              <h4 className="font-semibold text-sm mb-2">Purchases</h4>
              <TableScroll>
                <DataTable columns={['Date', 'Table', 'Amount']}>
                  {purchases.length === 0 && <EmptyRow span={3}>Koi purchase nahi hai abhi.</EmptyRow>}
                  {purchases.map((b) => (
                    <tr key={b.id}>
                      <td className={td}>{new Date(b.ts).toLocaleDateString('en-IN')}</td>
                      <td className={td}>{b.table}</td>
                      <td className={td}>{rupee(b.total)}</td>
                    </tr>
                  ))}
                </DataTable>
              </TableScroll>
              <h4 className="font-semibold text-sm mb-2 mt-4">Udhar Khata</h4>
              <TableScroll>
                <DataTable columns={['Date', 'Type', 'Amount', 'Note']}>
                  {udharLog.length === 0 && <EmptyRow span={4}>Koi udhar activity nahi hai abhi.</EmptyRow>}
                  {udharLog.map((u) => (
                    <tr key={u.id}>
                      <td className={td}>{u.date}</td>
                      <td className={td}>{u.type === 'charge' ? 'Udhar Diya' : 'Udhar Wasooli'}</td>
                      <td className={td}>{u.type === 'charge' ? '+' : '-'}{rupee(u.amount)}</td>
                      <td className={td}>{u.note || '-'}</td>
                    </tr>
                  ))}
                </DataTable>
              </TableScroll>
              <h4 className="font-semibold text-sm mb-2 mt-4">Points Log</h4>
              <TableScroll>
                <DataTable columns={['Date', 'Type', 'Points', 'Note']}>
                  {pointsLog.length === 0 && <EmptyRow span={4}>Koi points activity nahi hai abhi.</EmptyRow>}
                  {pointsLog.map((l) => (
                    <tr key={l.id}>
                      <td className={td}>{l.date}</td>
                      <td className={td}>{l.type}</td>
                      <td className={td}>{l.type === 'redeem' ? '-' : '+'}{l.points}</td>
                      <td className={td}>{l.note || '-'}</td>
                    </tr>
                  ))}
                </DataTable>
              </TableScroll>
              <ModalActions>
                <Btn onClick={() => setHistoryModal(null)}>Close</Btn>
              </ModalActions>
            </>
          );
        })()}
      </Modal>

      <Modal open={!!editCustomer} onClose={() => setEditCustomer(null)} title={editCustomer ? `Edit — ${editCustomer.name || editCustomer.phone}` : ''}>
        {editCustomer && (
          <form onSubmit={saveEditCustomer}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Customer name</label>
              <input name="name" defaultValue={editCustomer.name || ''} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Phone number</label>
              <input name="phone" required defaultValue={editCustomer.phone} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <ModalActions>
              <Btn variant="primary" type="submit">Save Changes</Btn>
              <Btn type="button" onClick={() => setEditCustomer(null)}>Cancel</Btn>
            </ModalActions>
          </form>
        )}
      </Modal>
    </section>
  );
}
