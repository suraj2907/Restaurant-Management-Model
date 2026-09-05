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
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

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

  async function quickAdvance(e) {
    e.preventDefault();
    const f = e.target;
    const staffMember = staff.find((s) => s.id === f.staffId.value);
    const amount = parseFloat(f.amount.value);
    if (!staffMember || !amount || amount <= 0) return;
    const date = todayStr();
    setPayments([...payments, { id: uid(), staffId: staffMember.id, staffName: staffMember.name, date, amount, note: 'Quick cash advance', type: 'advance' }]);
    await dbInsert('expenses', { id: uid(), date, category: 'Staff Salary', note: `Advance/peshgi paid to ${staffMember.name} - Quick cash advance`, amount });
    f.reset();
  }

  function markAttendanceOn(date, staffId, staffName, status) {
    setAttendance((prev) => {
      const existing = prev.find((a) => a.staffId === staffId && a.date === date);
      if (existing) return prev.map((a) => (a === existing ? { ...a, status } : a));
      return [...prev, { id: uid(), staffId, staffName, date, status }];
    });
  }

  function markAttendance(staffId, staffName, status) {
    markAttendanceOn(attendanceDate, staffId, staffName, status);
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

  const today = todayStr();
  const totalWageDue = staffRows.reduce((s, x) => s + Math.max(0, x.balance), 0);
  const totalAdvance = staffRows.reduce((s, x) => s + Math.max(0, -x.balance), 0);

  const todayAttendanceByStaff = useMemo(() => {
    const map = {};
    for (const s of staff) map[s.id] = attendance.find((a) => a.staffId === s.id && a.date === today)?.status;
    return map;
  }, [staff, attendance, today]);

  const presentTodayCount = staff.filter((s) => todayAttendanceByStaff[s.id] === 'present' || todayAttendanceByStaff[s.id] === 'half-day').length;
  const absentTodayCount = staff.filter((s) => todayAttendanceByStaff[s.id] === 'absent').length;
  const halfDayTodayCount = staff.filter((s) => todayAttendanceByStaff[s.id] === 'half-day').length;
  const leaveTodayCount = staff.filter((s) => todayAttendanceByStaff[s.id] === 'leave').length;
  const attendanceRate = staff.length ? (presentTodayCount / staff.length) * 100 : 0;

  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const estWageBurnToday = staff.reduce((sum, s) => {
    const st = todayAttendanceByStaff[s.id];
    const mult = st === 'present' ? 1 : st === 'half-day' ? 0.5 : 0;
    const dailyRate = s.wageType === 'daily' ? s.salary : s.salary / daysInMonth;
    return sum + dailyRate * mult;
  }, 0);

  const todayTips = tips.filter((t) => t.date === today).reduce((s, t) => s + t.amount, 0);
  const tipsPerPerson = presentTodayCount ? todayTips / presentTodayCount : 0;

  const monthGrossLiability = staff.reduce((sum, s) => {
    const monthAttendance = attendance.filter((a) => a.staffId === s.id && a.date.startsWith(today.slice(0, 7)));
    const monthPresentDays = monthAttendance.reduce((d, a) => d + (a.status === 'present' ? 1 : a.status === 'half-day' ? 0.5 : 0), 0);
    return sum + (s.wageType === 'daily' ? monthPresentDays * s.salary : s.salary);
  }, 0);
  const monthAdvanceIssued = payments.filter((p) => p.type === 'advance' && p.date.startsWith(today.slice(0, 7))).reduce((s, p) => s + p.amount, 0);

  const roles = useMemo(() => ['All', ...new Set(staff.map((s) => s.role).filter(Boolean))], [staff]);
  const visibleStaffRows = staffRows.filter((s) =>
    (roleFilter === 'All' || s.role === roleFilter) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
        <h2 className="text-lg font-bold m-0">Staff, Attendance &amp; Salary Khata</h2>
        <button
          onClick={() => setAttendanceModal(true)}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-dark"
        >
          Mark Attendance (Other Date)
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <div className="bg-surface border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="block text-[0.68rem] text-muted uppercase">Aaj ki Hazri ({staff.length} Staff)</span>
            {staff.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-good/15 text-good text-[0.6rem] font-bold">{attendanceRate.toFixed(0)}%</span>}
          </div>
          <span className="font-extrabold text-2xl block">{presentTodayCount}</span>
          <span className="text-[0.68rem] text-muted">{absentTodayCount} Absent • {halfDayTodayCount} Half • {leaveTodayCount} Leave</span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.68rem] text-muted uppercase">Dainik Wage Burn (Est.)</span>
          <span className="font-extrabold text-2xl block">{rupee(estWageBurnToday)}</span>
          <span className="text-[0.68rem] text-muted">Aaj present staff ke hisaab se</span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="block text-[0.68rem] text-muted uppercase">Tips Pool (Today)</span>
          <span className="font-extrabold text-2xl block">{rupee(todayTips)}</span>
          <span className="text-[0.68rem] text-muted">{rupee(tipsPerPerson)}/person ({presentTodayCount} present)</span>
        </div>
        <div className="rounded-lg p-3" style={{ background: '#FEF3C7' }}>
          <div className="flex items-center justify-between">
            <span className="block text-[0.68rem] uppercase text-pending-text">Month Payroll Cycle</span>
            <span className="text-[0.6rem] font-bold text-pending-text">Day {dayOfMonth}/{daysInMonth}</span>
          </div>
          <span className="font-extrabold text-lg block text-pending-text">{rupee(monthGrossLiability)}</span>
          <span className="text-[0.68rem] text-pending-text">Peshgi issued: {rupee(monthAdvanceIssued)}</span>
        </div>
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

      <div className="flex items-center gap-2.5 flex-wrap mb-3.5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff by name or role..." className="px-2.5 py-2 border border-border rounded-md text-sm flex-1 min-w-[180px]" />
        <div className="flex gap-1.5 flex-wrap">
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${roleFilter === r ? 'bg-accent text-white border-accent' : 'bg-surface border-border text-muted'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <TableScroll>
        <DataTable columns={['Staff Member', 'Attendance', 'Salary Basis', 'Month Peshgi', 'Net Payable (till date)', 'Quick Action']}>
          {!staffLoaded && <SkeletonRows rows={4} cols={6} />}
          {staffLoaded && visibleStaffRows.length === 0 && <EmptyRow span={6}>Koi staff nahi mila.</EmptyRow>}
          {staffLoaded && visibleStaffRows.map((s) => {
            const todayStatus = todayAttendanceByStaff[s.id];
            const monthAdvance = payments.filter((p) => p.staffId === s.id && p.type === 'advance' && p.date.startsWith(today.slice(0, 7))).reduce((sum, p) => sum + p.amount, 0);
            return (
              <tr key={s.id}>
                <td className={td}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-accent/15 text-accent-dark flex items-center justify-center font-bold text-xs shrink-0">
                      {s.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <span className="font-semibold block">{s.name}</span>
                      <span className="text-xs text-muted">{s.role}</span>
                    </div>
                  </div>
                </td>
                <td className={td}>
                  <div className="flex gap-1">
                    {ATTENDANCE_STATUS.map((st) => (
                      <button
                        key={st}
                        onClick={() => markAttendanceOn(today, s.id, s.name, st)}
                        title={ATTENDANCE_LABEL[st]}
                        className={`w-7 h-7 rounded-md text-xs font-bold border ${
                          todayStatus === st ? ATTENDANCE_STYLE[st] + ' border-transparent' : 'bg-bg border-border text-muted'
                        }`}
                      >
                        {ATTENDANCE_LABEL[st][0]}
                      </button>
                    ))}
                  </div>
                </td>
                <td className={td}>
                  {rupee(s.salary)}{s.wageType === 'daily' ? '/din' : '/mo'}
                  <span className="block text-xs text-muted">{s.wageType === 'daily' ? 'Daily Dihadi' : 'Fixed Monthly'}</span>
                </td>
                <td className={td}>{monthAdvance > 0 ? rupee(monthAdvance) : '-'}</td>
                <td className={`${td} ${s.balance > 0 ? 'text-bad font-bold' : 'text-good font-semibold'}`}>
                  {s.balance > 0 ? `${rupee(s.balance)} due` : `${rupee(-s.balance)} advance`}
                </td>
                <td className={`${td} space-x-1.5 whitespace-nowrap`}>
                  <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setPayModal(s)}>Pay</button>
                  <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setHistoryModal(s)}>Khata</button>
                  <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setEditStaff(s)}>Edit</button>
                  <button className="text-bad underline text-sm" onClick={() => setRemoveStaffTarget(s)}>Remove</button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </TableScroll>

      {staff.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-3.5 mt-4">
          <h3 className="font-bold text-sm mb-1">Quick Cash Advance (Peshgi)</h3>
          <p className="text-muted text-xs mb-3">Staff ko turant advance dena ho to yahan se seedha log karein — salary khata aur Expenses dono mein apne aap add ho jayega.</p>
          <form onSubmit={quickAdvance} className="flex gap-2.5 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted font-semibold">Staff</label>
              <select name="staffId" required className="px-2.5 py-2 border border-border rounded-md text-sm">
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted font-semibold">Amount</label>
              <input name="amount" type="number" step="0.01" required placeholder="e.g. 1000" className="px-2.5 py-2 border border-border rounded-md text-sm w-32" />
            </div>
            <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Pay Peshgi</button>
          </form>
        </div>
      )}

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
