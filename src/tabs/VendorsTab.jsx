import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonCards } from '../components/Skeleton.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

export default function VendorsTab() {
  const [vendors, setVendors, vendorsLoaded] = useSupabaseTable('vendors', []);
  const [purchases] = useSupabaseTable('vendor_purchases', []);
  const [payments, setPayments] = useSupabaseTable('vendor_payments', []);
  const [payModal, setPayModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [editVendor, setEditVendor] = useState(null);

  function addVendor(e) {
    e.preventDefault();
    const f = e.target;
    setVendors([
      ...vendors,
      {
        id: uid(),
        name: f.name.value.trim(),
        contact: f.contact.value.trim(),
        openingBalance: parseFloat(f.openingBalance.value) || 0,
        createdDate: todayStr()
      }
    ]);
    f.reset();
  }

  function confirmRemoveVendor() {
    setVendors(vendors.filter((v) => v.id !== removeTarget.id));
    setRemoveTarget(null);
  }

  function saveEditVendor(e) {
    e.preventDefault();
    const f = e.target;
    setVendors(vendors.map((v) => (v.id === editVendor.id ? {
      ...v,
      name: f.name.value.trim(),
      contact: f.contact.value.trim(),
      openingBalance: parseFloat(f.openingBalance.value) || 0
    } : v)));
    setEditVendor(null);
  }

  function savePayment(e) {
    e.preventDefault();
    const f = e.target;
    const amount = parseFloat(f.amount.value);
    const date = f.date.value;
    const note = f.note.value.trim();
    if (!amount || amount <= 0) return;
    setPayments([...payments, { id: uid(), vendorId: payModal.id, vendorName: payModal.name, date, amount, note }]);
    setPayModal(null);
  }

  function vendorTotals(vendorId, openingBalance) {
    const purchased = purchases.filter((p) => p.vendorId === vendorId).reduce((s, p) => s + p.amount, 0);
    const paid = payments.filter((p) => p.vendorId === vendorId).reduce((s, p) => s + p.amount, 0);
    const totalOwed = openingBalance + purchased;
    const balance = totalOwed - paid;
    return { purchased, paid, balance };
  }

  const vendorRows = useMemo(
    () => vendors.map((v) => ({ ...v, ...vendorTotals(v.id, v.openingBalance) })),
    [vendors, purchases, payments]
  );
  const totalPayable = vendorRows.reduce((s, v) => s + Math.max(0, v.balance), 0);

  return (
    <section>
      <h2 className="text-lg font-bold mb-3.5">Vendors &amp; Payables (Khata)</h2>
      <p className="text-muted text-sm -mt-1 mb-3.5">
        Inventory tab mein "Log In/Out" karte waqt vendor select karke amount daaloge to yahan aur Expenses mein automatically add ho jayega.
      </p>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.68rem] text-muted uppercase">Total Vendors</span>
          <span className="font-extrabold text-xl">{vendors.length}</span>
        </div>
        <div className={`rounded-lg p-3 border ${totalPayable > 0 ? 'bg-bad/10 border-bad' : 'bg-surface border-border'}`}>
          <span className={`block text-[0.68rem] uppercase ${totalPayable > 0 ? 'text-bad' : 'text-muted'}`}>Total Payable (Khata Due)</span>
          <span className={`font-extrabold text-xl ${totalPayable > 0 ? 'text-bad' : ''}`}>{rupee(totalPayable)}</span>
        </div>
      </div>

      <form onSubmit={addVendor} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Vendor name (e.g. Sharma Gas Agency)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="contact" placeholder="Contact number (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="openingBalance" type="number" step="0.01" placeholder="Previous balance due (agar already hai)" className="px-2.5 py-2 border border-border rounded-md text-sm w-64" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Vendor</button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {!vendorsLoaded && <SkeletonCards count={3} />}
        {vendorsLoaded && vendorRows.length === 0 && <p className="text-muted text-sm col-span-full">Koi vendor add nahi kiya abhi.</p>}
        {vendorsLoaded && vendorRows.map((v) => (
          <div key={v.id} className={`bg-surface border rounded-xl p-3.5 shadow-card flex flex-col gap-2.5 ${v.balance > 0 ? 'border-bad' : 'border-border'}`}>
            <div>
              <span className="font-bold text-sm block">{v.name}</span>
              <span className="text-xs text-muted">{v.contact || 'No contact'}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 bg-well/60 rounded-lg p-2 text-center">
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Purchases</span>
                <span className="font-bold text-sm">{rupee(v.purchased)}</span>
              </div>
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Paid</span>
                <span className="font-bold text-sm">{rupee(v.paid)}</span>
              </div>
            </div>
            <div className={`rounded-lg p-2 flex items-center justify-between ${v.balance > 0 ? 'bg-bad/10' : 'bg-good/10'}`}>
              <span className={`text-xs font-semibold ${v.balance > 0 ? 'text-bad' : 'text-good'}`}>{v.balance > 0 ? 'Balance Due' : 'Advance'}</span>
              <span className={`font-bold ${v.balance > 0 ? 'text-bad' : 'text-good'}`}>{rupee(Math.abs(v.balance))}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-good text-white hover:opacity-90" onClick={() => setPayModal(v)}>Pay Vendor</button>
              <button className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setHistoryModal(v)}>History</button>
            </div>
            <div className="flex gap-1.5">
              <button className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditVendor(v)}>Edit</button>
              <button className="flex-1 py-1.5 rounded-md text-xs font-semibold text-bad border border-bad/30 hover:bg-bad/5" onClick={() => setRemoveTarget(v)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={payModal ? `Pay Vendor — ${payModal.name}` : ''}>
        <form onSubmit={savePayment}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Date</label>
            <input name="date" type="date" defaultValue={todayStr()} required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Amount</label>
            <input name="amount" type="number" step="0.01" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. Cash payment for August" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Save Payment</Btn>
            <Btn type="button" onClick={() => setPayModal(null)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={historyModal ? `History — ${historyModal.name}` : ''} wide>
        {historyModal && (() => {
          const vPurchases = purchases.filter((p) => p.vendorId === historyModal.id).sort((a, b) => b.date.localeCompare(a.date));
          const vPayments = payments.filter((p) => p.vendorId === historyModal.id).sort((a, b) => b.date.localeCompare(a.date));
          const { purchased, paid, balance } = vendorTotals(historyModal.id, historyModal.openingBalance);
          return (
            <>
              <div className="flex gap-3 flex-wrap mb-3.5">
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">Opening Balance</span>
                  <span className="font-bold">{rupee(historyModal.openingBalance)}</span>
                </div>
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">Total Purchases</span>
                  <span className="font-bold">{rupee(purchased)}</span>
                </div>
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">Total Paid</span>
                  <span className="font-bold">{rupee(paid)}</span>
                </div>
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">{balance > 0 ? 'Balance Due' : 'Advance'}</span>
                  <span className="font-bold">{rupee(Math.abs(balance))}</span>
                </div>
              </div>
              <h4 className="font-semibold text-sm mb-2">Purchases (via Inventory Stock-In)</h4>
              <TableScroll>
                <DataTable columns={['Date', 'Item', 'Qty', 'Amount']}>
                  {vPurchases.length === 0 && <EmptyRow span={4}>Koi purchase nahi hai abhi.</EmptyRow>}
                  {vPurchases.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>{p.date}</td>
                      <td className={td}>{p.itemName}</td>
                      <td className={td}>{p.qty} {p.unit}</td>
                      <td className={td}>{rupee(p.amount)}</td>
                    </tr>
                  ))}
                </DataTable>
              </TableScroll>
              <h4 className="font-semibold text-sm mb-2 mt-4">Payments Made</h4>
              <TableScroll>
                <DataTable columns={['Date', 'Amount', 'Note']}>
                  {vPayments.length === 0 && <EmptyRow span={3}>Koi payment nahi hua abhi.</EmptyRow>}
                  {vPayments.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>{p.date}</td>
                      <td className={td}>{rupee(p.amount)}</td>
                      <td className={td}>{p.note || '-'}</td>
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

      <Modal open={!!editVendor} onClose={() => setEditVendor(null)} title={editVendor ? `Edit — ${editVendor.name}` : ''}>
        {editVendor && (
          <form onSubmit={saveEditVendor}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Vendor name</label>
              <input name="name" required defaultValue={editVendor.name} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Contact number</label>
              <input name="contact" defaultValue={editVendor.contact || ''} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Opening balance</label>
              <input name="openingBalance" type="number" step="0.01" defaultValue={editVendor.openingBalance || 0} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <ModalActions>
              <Btn variant="primary" type="submit">Save Changes</Btn>
              <Btn type="button" onClick={() => setEditVendor(null)}>Cancel</Btn>
            </ModalActions>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={!!removeTarget}
        title="Remove Vendor"
        message={removeTarget ? `"${removeTarget.name}" ko remove karein? Purchase/payment history save rahegi.` : ''}
        onConfirm={confirmRemoveVendor}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}
