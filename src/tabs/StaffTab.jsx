import { useState } from 'react';
import { useLocalState } from '../lib/useLocalState.js';
import { uid, rupee, todayStr, monthsElapsed, store } from '../lib/store.js';
import { TableScroll, DataTable, EmptyRow, td } from '../components/Table.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

const ATTENDANCE_STATUS = ['present', 'absent', 'half-day', 'leave'];
const ATTENDANCE_LABEL = { present: 'Present', absent: 'Absent', 'half-day': 'Half Day', leave: 'Leave' };
const ATTENDANCE_STYLE = {
  present: 'bg-good/15 text-good',
  absent: 'bg-bad/10 text-bad',
  'half-day': 'bg-accent/10 text-accent-dark',
  leave: 'bg-border/60 text-muted'
};

export default function StaffTab() {
  const [staff, setStaff] = useLocalState('rm_staff', []);
  const [payments, setPayments] = useLocalState('rm_salary_payments', []);
  const [attendance, setAttendance] = useLocalState('rm_attendance', []);
  const [payModal, setPayModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [attendanceModal, setAttendanceModal] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(todayStr());

  function addStaff(e) {
    e.preventDefault();
    const f = e.target;
    setStaff([
      ...staff,
      { id: uid(), name: f.name.value.trim(), role: f.role.value.trim(), salary: parseFloat(f.salary.value), joinDate: todayStr() }
    ]);
    f.reset();
  }

  function removeStaff(id) {
    if (!confirm('Ye staff member remove karein? Payment history save rahegi.')) return;
    setStaff(staff.filter((s) => s.id !== id));
  }

  function savePayment(e) {
    e.preventDefault();
    const f = e.target;
    const amount = parseFloat(f.amount.value);
    const date = f.date.value;
    const note = f.note.value.trim();
    if (!amount || amount <= 0) return;

    setPayments([...payments, { id: uid(), staffId: payModal.id, staffName: payModal.name, date, amount, note }]);

    const exp = store.get('rm_expenses', []);
    exp.push({ id: uid(), date, category: 'Staff Salary', note: `Salary paid to ${payModal.name}${note ? ' - ' + note : ''}`, amount });
    store.set('rm_expenses', exp);

    setPayModal(null);
  }

  function markAttendance(staffId, staffName, status) {
    setAttendance((prev) => {
      const existing = prev.find((a) => a.staffId === staffId && a.date === attendanceDate);
      if (existing) return prev.map((a) => (a === existing ? { ...a, status } : a));
      return [...prev, { id: uid(), staffId, staffName, date: attendanceDate, status }];
    });
  }

  function presentDaysThisMonth(staffId) {
    const month = todayStr().slice(0, 7);
    return attendance.filter((a) => a.staffId === staffId && a.date.startsWith(month) && (a.status === 'present' || a.status === 'half-day')).length;
  }

  const recentPayments = payments.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

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
        <input name="salary" type="number" step="0.01" required placeholder="Monthly salary" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Staff</button>
      </form>

      <TableScroll>
        <DataTable columns={['Name', 'Role', 'Present (This Month)', 'Monthly Salary', 'Total Due (till date)', 'Total Paid', 'Balance', 'Actions']}>
          {staff.length === 0 && <EmptyRow span={8}>Koi staff add nahi kiya abhi.</EmptyRow>}
          {staff.map((s) => {
            const totalPaid = payments.filter((p) => p.staffId === s.id).reduce((sum, p) => sum + p.amount, 0);
            const totalDue = s.salary * monthsElapsed(s.joinDate || todayStr());
            const balance = totalDue - totalPaid;
            return (
              <tr key={s.id}>
                <td className={td}>{s.name}</td>
                <td className={td}>{s.role}</td>
                <td className={td}>{presentDaysThisMonth(s.id)} din</td>
                <td className={td}>{rupee(s.salary)}</td>
                <td className={td}>{rupee(totalDue)}</td>
                <td className={td}>{rupee(totalPaid)}</td>
                <td className={`${td} ${balance > 0 ? 'text-bad font-bold' : 'text-good font-semibold'}`}>
                  {balance > 0 ? `${rupee(balance)} pending` : `${rupee(-balance)} advance`}
                </td>
                <td className={`${td} space-x-2`}>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setPayModal(s)}>
                    Pay Salary
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setHistoryModal(s)}>
                    History
                  </button>
                  <button className="text-bad underline text-sm" onClick={() => removeStaff(s.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </TableScroll>

      <h2 className="text-lg font-bold mt-6 mb-3.5">Recent Salary Payments (all staff)</h2>
      <TableScroll>
        <DataTable columns={['Date', 'Staff', 'Amount', 'Note']}>
          {recentPayments.length === 0 && <EmptyRow span={4}>Koi payment log nahi hai abhi.</EmptyRow>}
          {recentPayments.map((p) => (
            <tr key={p.id}>
              <td className={td}>{p.date}</td>
              <td className={td}>{p.staffName}</td>
              <td className={td}>{rupee(p.amount)}</td>
              <td className={td}>{p.note || '-'}</td>
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
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. Advance / part payment" className="px-2.5 py-2 border border-border rounded-md text-sm" />
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
          const totalDue = historyModal.salary * monthsElapsed(historyModal.joinDate || todayStr());
          const balance = totalDue - totalPaid;
          return (
            <>
              <div className="flex gap-3 flex-wrap mb-3.5">
                <div className="bg-bg border border-border rounded-lg px-3 py-2">
                  <span className="block text-[0.72rem] text-muted uppercase">Monthly Salary</span>
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
              <TableScroll>
                <DataTable columns={['Date', 'Amount', 'Note']}>
                  {list.length === 0 && <EmptyRow span={3}>Abhi tak koi payment nahi hua.</EmptyRow>}
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>{p.date}</td>
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
    </section>
  );
}
