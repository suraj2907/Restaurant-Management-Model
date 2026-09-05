import { useMemo, useState } from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { dbInsert } from '../lib/db.js';
import { uid, rupee, todayStr, monthsElapsed } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import { SkeletonRows } from '../components/Skeleton.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

// Daily-wage ("dihadi") staff earn per present day worked rather than a
// fixed monthly amount, so their total due is attendance-driven, not
// calendar-driven.
function presentDayCount(staffId, attendance) {
  return attendance
    .filter((a) => a.staffId === staffId)
    .reduce((sum, a) => sum + (a.status === 'present' ? 1 : a.status === 'half-day' ? 0.5 : 0), 0);
}

function totalDueFor(s, attendance) {
  return s.wageType === 'daily' ? s.salary * presentDayCount(s.id, attendance) : s.salary * monthsElapsed(s.joinDate || todayStr());
}

// Builds a month-by-month salary ledger for one staff member: each month's
// due carries forward any unpaid balance from the month before (so "pichle
// mahine ka bacha hua" shows up added into the new month's payable amount),
// and total payments are allocated oldest-month-first.
function monthlyLedger(s, payments) {
  const paidTotal = payments.filter((p) => p.staffId === s.id).reduce((sum, p) => sum + p.amount, 0);
  let paidPool = paidTotal;

  const start = new Date((s.joinDate || todayStr()) + 'T00:00:00');
  const now = new Date();
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);

  const months = [];
  let carry = 0;
  while (cursor <= end) {
    const due = s.salary;
    const payable = carry + due;
    const paidNow = Math.min(paidPool, payable);
    paidPool -= paidNow;
    const balance = payable - paidNow;
    months.push({
      label: cursor.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      due,
      carry,
      payable,
      paid: paidNow,
      balance
    });
    carry = balance;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months.reverse();
}

const ATTENDANCE_STATUS = ['present', 'absent', 'half-day', 'leave'];
const ATTENDANCE_LABEL = { present: 'Present', absent: 'Absent', 'half-day': 'Half Day', leave: 'Leave' };
const ATTENDANCE_STYLE = {
  present: 'bg-good/15 text-good',
  absent: 'bg-bad/10 text-bad',
  'half-day': 'bg-accent/10 text-accent-dark',
  leave: 'bg-border/60 text-muted'
};

export default function StaffTab() {
  const [staff, setStaff, staffLoaded] = useSupabaseTable('staff', []);
  const [payments, setPayments] = useSupabaseTable('salary_payments', []);
  const [attendance, setAttendance] = useSupabaseTable('attendance', []);
  const [tips, setTips] = useSupabaseTable('daily_tips', []);
  const [payModal, setPayModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [attendanceModal, setAttendanceModal] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [editStaff, setEditStaff] = useState(null);
  const [removeStaffTarget, setRemoveStaffTarget] = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [removePaymentTarget, setRemovePaymentTarget] = useState(null);

  function addStaff(e) {
    e.preventDefault();
    const f = e.target;
    setStaff([
      ...staff,
      { id: uid(), name: f.name.value.trim(), role: f.role.value.trim(), salary: parseFloat(f.salary.value), wageType: f.wageType.value, joinDate: todayStr() }
    ]);
    f.reset();
  }

  function saveEditStaff(e) {
    e.preventDefault();
    const f = e.target;
    setStaff(staff.map((s) => (s.id === editStaff.id ? {
      ...s,
      name: f.name.value.trim(),
      role: f.role.value.trim(),
      salary: parseFloat(f.salary.value),
      wageType: f.wageType.value
    } : s)));
    setEditStaff(null);
  }

  function addTips(e) {
    e.preventDefault();
    const f = e.target;
    const amount = parseFloat(f.amount.value);
    if (!amount || amount <= 0) return;
    setTips([...tips, { id: uid(), date: f.date.value, amount, note: f.note.value.trim() }]);
    f.reset();
    f.date.value = todayStr();
  }

  function confirmRemoveStaff() {
    setStaff(staff.filter((s) => s.id !== removeStaffTarget.id));
    setRemoveStaffTarget(null);
  }

  async function savePayment(e) {
    e.preventDefault();
    const f = e.target;
    const amount = parseFloat(f.amount.value);
    const date = f.date.value;
    const note = f.note.value.trim();
    const type = f.type.value;
    if (!amount || amount <= 0) return;

    setPayments([...payments, { id: uid(), staffId: payModal.id, staffName: payModal.name, date, amount, note, type }]);

    const label = type === 'advance' ? 'Advance/peshgi paid to' : 'Salary paid to';
    await dbInsert('expenses', { id: uid(), date, category: 'Staff Salary', note: `${label} ${payModal.name}${note ? ' - ' + note : ''}`, amount });

    setPayModal(null);
  }

  function saveEditPayment(e) {
    e.preventDefault();
    const f = e.target;
    const amount = parseFloat(f.amount.value);
    const date = f.date.value;
    const note = f.note.value.trim();
    const type = f.type.value;
    if (!amount || amount <= 0) return;
    setPayments(payments.map((p) => (p.id === editPayment.id ? { ...p, date, amount, note, type } : p)));
    setEditPayment(null);
  }

  function confirmRemovePayment() {
    setPayments(payments.filter((p) => p.id !== removePaymentTarget.id));
    setRemovePaymentTarget(null);
  }

  function markAttendance(staffId, staffName, status) {
    setAttendance((prev) => {
      const existing = prev.find((a) => a.staffId === staffId && a.date === attendanceDate);
      if (existing) return prev.map((a) => (a === existing ? { ...a, status } : a));
      return [...prev, { id: uid(), staffId, staffName, date: attendanceDate, status }];
    });
  }

  // Per-staff totals walk the full payments/attendance lists, so compute all
  // of them together once per data change rather than re-filtering per row
  // on every render (this tab re-renders on every attendance click).
  const staffRows = useMemo(() => {
    const month = todayStr().slice(0, 7);
    return staff.map((s) => {
      const totalPaid = payments.filter((p) => p.staffId === s.id).reduce((sum, p) => sum + p.amount, 0);
      const totalDue = totalDueFor(s, attendance);
      const presentDays = attendance
        .filter((a) => a.staffId === s.id && a.date.startsWith(month))
        .reduce((sum, a) => sum + (a.status === 'present' ? 1 : a.status === 'half-day' ? 0.5 : 0), 0);
      return { ...s, totalPaid, totalDue, balance: totalDue - totalPaid, presentDays };
    });
  }, [staff, payments, attendance]);

  const recentPayments = useMemo(() => payments.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15), [payments]);

  const tipsTotal = useMemo(() => tips.reduce((s, t) => s + t.amount, 0), [tips]);
  const recentTips = useMemo(() => tips.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10), [tips]);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
        <h2 className="text-lg font-bold m-0">Staff &amp; Salary</h2>
        <button
          onClick={() => setAttendanceModal(true)}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-dark"
        >
          Mark Attendance
        </button>
      </div>
      <form onSubmit={addStaff} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Staff name" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="role" required placeholder="Role (e.g. Waiter, Cook)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <select name="wageType" defaultValue="monthly" className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="monthly">Monthly Salary</option>
          <option value="daily">Daily Wage (Dihadi)</option>
        </select>
        <input name="salary" type="number" step="0.01" required placeholder="Amount (per month or per day)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Staff</button>
      </form>

      <TableScroll>
        <DataTable columns={['Name', 'Role', 'Present (This Month)', 'Wage', 'Total Due (till date)', 'Total Paid', 'Balance', 'Actions']}>
          {!staffLoaded && <SkeletonRows rows={3} cols={8} />}
          {staffLoaded && staffRows.length === 0 && <EmptyRow span={8}>Koi staff add nahi kiya abhi.</EmptyRow>}
          {staffLoaded && staffRows.map((s) => {
            return (
              <tr key={s.id}>
                <td className={td}>{s.name}</td>
                <td className={td}>{s.role}</td>
                <td className={td}>{s.presentDays} din</td>
                <td className={td}>{rupee(s.salary)}{s.wageType === 'daily' ? '/din' : '/mo'}</td>
                <td className={td}>{rupee(s.totalDue)}</td>
                <td className={td}>{rupee(s.totalPaid)}</td>
                <td className={`${td} ${s.balance > 0 ? 'text-bad font-bold' : 'text-good font-semibold'}`}>
                  {s.balance > 0 ? `${rupee(s.balance)} pending` : `${rupee(-s.balance)} advance`}
                </td>
                <td className={`${td} space-x-2`}>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setPayModal(s)}>
                    Pay Salary
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setHistoryModal(s)}>
                    History
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditStaff(s)}>
                    Edit
                  </button>
                  <button className="text-bad underline text-sm" onClick={() => setRemoveStaffTarget(s)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </TableScroll>

      <h2 className="text-lg font-bold mt-6 mb-3.5">Recent Salary Payments (all staff)</h2>
      <p className="text-muted text-xs -mt-2 mb-3.5">
        Note: payment edit/remove yahan sirf is log ko theek karta hai — usse auto-bani Expenses entry alag se update nahi hoti, wo Expenses tab mein manually theek kar sakte hain.
      </p>
      <TableScroll>
        <DataTable columns={['Date', 'Staff', 'Type', 'Amount', 'Note', 'Actions']}>
          {recentPayments.length === 0 && staffLoaded && <EmptyRow span={6}>Koi payment log nahi hai abhi.</EmptyRow>}
          {recentPayments.map((p) => (
            <tr key={p.id}>
              <td className={td}>{p.date}</td>
              <td className={td}>{p.staffName}</td>
              <td className={td}>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === 'advance' ? 'bg-secondary/15 text-secondary-dark' : 'bg-good/15 text-good'}`}>
                  {p.type === 'advance' ? 'Advance' : 'Salary'}
                </span>
              </td>
              <td className={td}>{rupee(p.amount)}</td>
              <td className={td}>{p.note || '-'}</td>
              <td className={`${td} space-x-2`}>
                <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditPayment(p)}>
                  Edit
                </button>
                <button className="text-bad underline text-sm" onClick={() => setRemovePaymentTarget(p)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>

      <div className="flex items-center justify-between flex-wrap gap-2 mt-6 mb-3.5">
        <h2 className="text-lg font-bold m-0">Daily Tips Pool</h2>
        <div className="bg-surface border border-border rounded-lg px-3 py-2">
          <span className="block text-[0.72rem] text-muted uppercase">Total Collected</span>
          <span className="font-bold">{rupee(tipsTotal)}</span>
        </div>
      </div>
      <p className="text-muted text-sm -mt-2 mb-3.5">Counter pe collect hone wale tips ka pool yahan log karein — staff mein baant'ne ka record khud rakhein.</p>
      <form onSubmit={addTips} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="date" type="date" defaultValue={todayStr()} required className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="amount" type="number" step="0.01" required placeholder="Amount collected" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="note" placeholder="Note (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Log Tips</button>
      </form>
      <TableScroll>
        <DataTable columns={['Date', 'Amount', 'Note', '']}>
          {recentTips.length === 0 && <EmptyRow span={4}>Koi tips log nahi hui abhi.</EmptyRow>}
          {recentTips.map((t) => (
            <tr key={t.id}>
              <td className={td}>{t.date}</td>
              <td className={td}>{rupee(t.amount)}</td>
              <td className={td}>{t.note || '-'}</td>
              <td className={td}>
                <button className="text-bad underline text-sm" onClick={() => setTips(tips.filter((x) => x.id !== t.id))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </TableScroll>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={payModal ? `Pay Salary — ${payModal.name}` : ''}>
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
            <label className="text-xs text-muted font-semibold">Type</label>
            <select name="type" defaultValue="salary" className="px-2.5 py-2 border border-border rounded-md text-sm">
              <option value="salary">Salary Payment</option>
              <option value="advance">Advance / Peshgi</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. Part payment for August" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Save Payment</Btn>
            <Btn type="button" onClick={() => setPayModal(null)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={historyModal ? `Payment History — ${historyModal.name}` : ''} wide>
        {historyModal && (() => {
          const list = payments.filter((p) => p.staffId === historyModal.id).sort((a, b) => b.date.localeCompare(a.date));
          const totalPaid = list.reduce((s, p) => s + p.amount, 0);
          const totalDue = totalDueFor(historyModal, attendance);
          const balance = totalDue - totalPaid;
          const isDaily = historyModal.wageType === 'daily';
          return (
            <>
              <div className="flex gap-3 flex-wrap mb-3.5">
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">{isDaily ? 'Daily Wage' : 'Monthly Salary'}</span>
                  <span className="font-bold">{rupee(historyModal.salary)}</span>
                </div>
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">Total Paid</span>
                  <span className="font-bold">{rupee(totalPaid)}</span>
                </div>
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">{balance > 0 ? 'Pending' : 'Advance'}</span>
                  <span className="font-bold">{rupee(Math.abs(balance))}</span>
                </div>
              </div>

              {!isDaily && (
                <>
                  <h4 className="font-semibold text-sm mb-2">Monthly Salary (pichle mahine ka pending naye mahine mein add hota hai)</h4>
                  <TableScroll>
                    <DataTable columns={['Month', 'Salary Due', 'Carried Forward', 'Total Payable', 'Paid', 'Balance']}>
                      {monthlyLedger(historyModal, payments).map((m) => (
                        <tr key={m.label}>
                          <td className={td}>{m.label}</td>
                          <td className={td}>{rupee(m.due)}</td>
                          <td className={td}>{m.carry > 0 ? rupee(m.carry) : '-'}</td>
                          <td className={td}>{rupee(m.payable)}</td>
                          <td className={td}>{rupee(m.paid)}</td>
                          <td className={`${td} ${m.balance > 0 ? 'text-bad font-bold' : 'text-good font-semibold'}`}>
                            {m.balance > 0 ? `${rupee(m.balance)} pending` : 'Paid up'}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </TableScroll>
                </>
              )}
              {isDaily && (
                <p className="text-muted text-sm bg-bg border border-border rounded-lg p-3">
                  Dihadi (daily-wage) staff ke liye due amount attendance ke hisaab se calculate hota hai — {presentDayCount(historyModal.id, attendance)} present din × {rupee(historyModal.salary)}/din = {rupee(totalDue)}.
                </p>
              )}

              <h4 className="font-semibold text-sm mb-2 mt-4">All Payments</h4>
              <TableScroll>
                <DataTable columns={['Date', 'Type', 'Amount', 'Note']}>
                  {list.length === 0 && <EmptyRow span={4}>Abhi tak koi payment nahi hua.</EmptyRow>}
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>{p.date}</td>
                      <td className={td}>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.type === 'advance' ? 'bg-secondary/15 text-secondary-dark' : 'bg-good/15 text-good'}`}>
                          {p.type === 'advance' ? 'Advance' : 'Salary'}
                        </span>
                      </td>
                      <td className={td}>{rupee(p.amount)}</td>
                      <td className={td}>{p.note || '-'}</td>
                    </tr>
                  ))}
                </DataTable>
              </TableScroll>

              <h4 className="font-semibold text-sm mb-2 mt-4">Recent Attendance</h4>
              <TableScroll>
                <DataTable columns={['Date', 'Status']}>
                  {(() => {
                    const attList = attendance.filter((a) => a.staffId === historyModal.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
                    if (attList.length === 0) return <EmptyRow span={2}>Abhi tak koi attendance mark nahi hui.</EmptyRow>;
                    return attList.map((a) => (
                      <tr key={a.id}>
                        <td className={td}>{a.date}</td>
                        <td className={td}><span className={`px-2 py-1 rounded-md text-xs font-semibold ${ATTENDANCE_STYLE[a.status]}`}>{ATTENDANCE_LABEL[a.status]}</span></td>
                      </tr>
                    ));
                  })()}
                </DataTable>
              </TableScroll>

              <ModalActions>
                <Btn onClick={() => setHistoryModal(null)}>Close</Btn>
              </ModalActions>
            </>
          );
        })()}
      </Modal>

      <Modal open={attendanceModal} onClose={() => setAttendanceModal(false)} title="Mark Attendance" wide>
        <div className="flex flex-col gap-1 mb-3.5">
          <label className="text-xs text-muted font-semibold">Date</label>
          <input
            type="date"
            value={attendanceDate}
            max={todayStr()}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className="px-2.5 py-2 border border-border rounded-md text-sm w-48"
          />
        </div>
        {staff.length === 0 ? (
          <p className="text-muted text-sm">Koi staff add nahi kiya abhi.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {staff.map((s) => {
              const current = attendance.find((a) => a.staffId === s.id && a.date === attendanceDate)?.status;
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 flex-wrap border border-border rounded-lg px-3 py-2.5">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {ATTENDANCE_STATUS.map((st) => (
                      <button
                        key={st}
                        onClick={() => markAttendance(s.id, s.name, st)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                          current === st ? ATTENDANCE_STYLE[st] + ' border-transparent' : 'bg-bg border-border text-muted'
                        }`}
                      >
                        {ATTENDANCE_LABEL[st]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <ModalActions>
          <Btn variant="primary" onClick={() => setAttendanceModal(false)}>Done</Btn>
        </ModalActions>
      </Modal>

      <Modal open={!!editStaff} onClose={() => setEditStaff(null)} title={editStaff ? `Edit — ${editStaff.name}` : ''}>
        {editStaff && (
          <form onSubmit={saveEditStaff}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Staff name</label>
              <input name="name" required defaultValue={editStaff.name} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Role</label>
              <input name="role" required defaultValue={editStaff.role} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Wage type</label>
              <select name="wageType" defaultValue={editStaff.wageType || 'monthly'} className="px-2.5 py-2 border border-border rounded-md text-sm">
                <option value="monthly">Monthly Salary</option>
                <option value="daily">Daily Wage (Dihadi)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Amount (per month or per day)</label>
              <input name="salary" type="number" step="0.01" required defaultValue={editStaff.salary} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <p className="text-muted text-xs -mt-1 mb-3">Salary change future "Total Due" calculation mein turant use hogi (purane mahine dobara calculate nahi hote).</p>
            <ModalActions>
              <Btn variant="primary" type="submit">Save Changes</Btn>
              <Btn type="button" onClick={() => setEditStaff(null)}>Cancel</Btn>
            </ModalActions>
          </form>
        )}
      </Modal>

      <Modal open={!!editPayment} onClose={() => setEditPayment(null)} title={editPayment ? `Edit Payment — ${editPayment.staffName}` : ''}>
        {editPayment && (
          <form onSubmit={saveEditPayment}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Date</label>
              <input name="date" type="date" required defaultValue={editPayment.date} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Amount</label>
              <input name="amount" type="number" step="0.01" required defaultValue={editPayment.amount} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Type</label>
              <select name="type" defaultValue={editPayment.type || 'salary'} className="px-2.5 py-2 border border-border rounded-md text-sm">
                <option value="salary">Salary Payment</option>
                <option value="advance">Advance / Peshgi</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Note</label>
              <input name="note" defaultValue={editPayment.note || ''} className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <ModalActions>
              <Btn variant="primary" type="submit">Save Changes</Btn>
              <Btn type="button" onClick={() => setEditPayment(null)}>Cancel</Btn>
            </ModalActions>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={!!removeStaffTarget}
        title="Remove Staff"
        message={removeStaffTarget ? `"${removeStaffTarget.name}" ko remove karein? Payment aur attendance history save rahegi.` : ''}
        onConfirm={confirmRemoveStaff}
        onCancel={() => setRemoveStaffTarget(null)}
      />

      <ConfirmModal
        open={!!removePaymentTarget}
        title="Remove Payment"
        message={removePaymentTarget ? `${removePaymentTarget.staffName} ki ${rupee(removePaymentTarget.amount)} (${removePaymentTarget.date}) payment entry remove karein?` : ''}
        onConfirm={confirmRemovePayment}
        onCancel={() => setRemovePaymentTarget(null)}
      />
    </section>
  );
}
