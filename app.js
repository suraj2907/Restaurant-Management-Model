/* ---------- Storage helpers ---------- */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonthStr = () => todayStr().slice(0, 7);

/* ---------- Seed demo data (only if first run) ---------- */
function seedIfEmpty() {
  if (store.get('rm_seeded', false)) return;
  store.set('rm_menu', [
    { id: uid(), name: 'Paneer Butter Masala', category: 'Main Course', price: 220, cost: 90 },
    { id: uid(), name: 'Dal Makhani', category: 'Main Course', price: 180, cost: 60 },
    { id: uid(), name: 'Veg Biryani', category: 'Rice', price: 190, cost: 75 },
    { id: uid(), name: 'Butter Naan', category: 'Bread', price: 40, cost: 12 },
    { id: uid(), name: 'Masala Dosa', category: 'South Indian', price: 110, cost: 35 },
    { id: uid(), name: 'Cold Coffee', category: 'Beverages', price: 90, cost: 25 },
    { id: uid(), name: 'Gulab Jamun', category: 'Dessert', price: 70, cost: 20 },
    { id: uid(), name: 'Veg Spring Roll', category: 'Starters', price: 150, cost: 55 }
  ]);
  store.set('rm_inventory', [
    { id: uid(), name: 'Paneer', unit: 'kg', qty: 8, min: 5 },
    { id: uid(), name: 'Basmati Rice', unit: 'kg', qty: 25, min: 10 },
    { id: uid(), name: 'LPG Cylinder', unit: 'pcs', qty: 2, min: 2 },
    { id: uid(), name: 'Cooking Oil', unit: 'ltr', qty: 6, min: 8 }
  ]);
  store.set('rm_expenses', []);
  store.set('rm_bills', []);
  store.set('rm_tables', ['T1', 'T2', 'T3', 'T4', 'Parcel']);
  store.set('rm_open_orders', {});
  store.set('rm_stock_log', []);
  store.set('rm_staff', []);
  store.set('rm_salary_payments', []);
  store.set('rm_seeded', true);
}

/* ---------- State ---------- */
let activeTable = null;

/* ---------- Tabs ---------- */
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'dashboard') renderDashboard();
  if (btn.dataset.tab === 'staff') renderStaff();
});

/* ---------- Restaurant name ---------- */
const nameInput = document.getElementById('restaurantName');
nameInput.value = store.get('rm_name', 'My Restaurant');
document.getElementById('pageTitle').textContent = nameInput.value + ' — Manager';
nameInput.addEventListener('input', () => {
  store.set('rm_name', nameInput.value);
  document.getElementById('pageTitle').textContent = nameInput.value + ' — Manager';
});

/* ---------- Utils ---------- */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ================= MENU SETUP ================= */
function renderMenuTable() {
  const menu = store.get('rm_menu', []);
  const tbody = document.querySelector('#menuTable tbody');
  tbody.innerHTML = menu.map(item => {
    const cost = item.cost || 0;
    const margin = item.price - cost;
    const marginPct = item.price ? (margin / item.price * 100) : 0;
    return `<tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${rupee(item.price)}</td>
      <td>${cost ? rupee(cost) : '-'}</td>
      <td>${cost ? `${rupee(margin)} (${marginPct.toFixed(0)}%)` : '-'}</td>
      <td><button class="link-btn" data-del-menu="${item.id}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="empty-hint">No menu items yet.</td></tr>`;
}

document.getElementById('menuForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const menu = store.get('rm_menu', []);
  menu.push({
    id: uid(),
    name: document.getElementById('itemName').value.trim(),
    category: document.getElementById('itemCategory').value.trim(),
    price: parseFloat(document.getElementById('itemPrice').value),
    cost: parseFloat(document.getElementById('itemCost').value) || 0
  });
  store.set('rm_menu', menu);
  e.target.reset();
  renderMenuTable();
  renderMenuGrid();
});

document.querySelector('#menuTable tbody').addEventListener('click', (e) => {
  const id = e.target.dataset.delMenu;
  if (!id) return;
  store.set('rm_menu', store.get('rm_menu', []).filter(m => m.id !== id));
  renderMenuTable();
  renderMenuGrid();
});

/* ================= BILLING (table-wise) ================= */
function getOpenOrders() { return store.get('rm_open_orders', {}); }
function setOpenOrders(o) { store.set('rm_open_orders', o); }
function currentOrderItems() {
  if (!activeTable) return [];
  return getOpenOrders()[activeTable] || [];
}

function renderTableStrip() {
  const tables = store.get('rm_tables', []);
  const oo = getOpenOrders();
  const strip = document.getElementById('tableStrip');
  strip.innerHTML = tables.map(t => {
    const hasOrder = oo[t] && oo[t].length > 0;
    return `<div class="table-chip ${t === activeTable ? 'active' : ''}" data-table="${escapeHtml(t)}">
      ${hasOrder ? '<span class="dot"></span>' : ''}${escapeHtml(t)}
      <span class="remove-x" data-remove-table="${escapeHtml(t)}">×</span>
    </div>`;
  }).join('');
}

document.getElementById('tableStrip').addEventListener('click', (e) => {
  const rm = e.target.dataset.removeTable;
  if (rm) {
    const oo = getOpenOrders();
    if (oo[rm] && oo[rm].length > 0) {
      if (!confirm(`Table "${rm}" mein pending order hai. Phir bhi remove karein?`)) return;
    }
    store.set('rm_tables', store.get('rm_tables', []).filter(t => t !== rm));
    delete oo[rm];
    setOpenOrders(oo);
    if (activeTable === rm) activeTable = null;
    renderTableStrip();
    renderOrder();
    return;
  }
  const chip = e.target.closest('.table-chip');
  if (!chip) return;
  activeTable = chip.dataset.table;
  renderTableStrip();
  renderOrder();
});

document.getElementById('addTableBtn').addEventListener('click', () => {
  const name = prompt('New table / token name (e.g. T5, Parcel-2):');
  if (!name || !name.trim()) return;
  const tables = store.get('rm_tables', []);
  if (tables.includes(name.trim())) { alert('Ye table already exist karta hai.'); return; }
  tables.push(name.trim());
  store.set('rm_tables', tables);
  activeTable = name.trim();
  renderTableStrip();
  renderOrder();
});

function renderMenuGrid(filter = '') {
  const menu = store.get('rm_menu', []);
  const grid = document.getElementById('menuGrid');
  const f = filter.toLowerCase();
  const items = menu.filter(m => m.name.toLowerCase().includes(f));
  grid.innerHTML = items.map(item => `
    <button class="menu-card" data-add="${item.id}">
      <span class="name">${escapeHtml(item.name)}</span>
      <span class="cat">${escapeHtml(item.category)}</span>
      <span class="price">${rupee(item.price)}</span>
    </button>`).join('') || `<div class="empty-hint">No items found.</div>`;
}

document.getElementById('menuSearch').addEventListener('input', (e) => renderMenuGrid(e.target.value));

document.getElementById('menuGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
  const menu = store.get('rm_menu', []);
  const item = menu.find(m => m.id === btn.dataset.add);
  if (!item) return;
  const oo = getOpenOrders();
  const arr = oo[activeTable] || [];
  const existing = arr.find(o => o.menuId === item.id);
  if (existing) existing.qty += 1;
  else arr.push({ menuId: item.id, name: item.name, price: item.price, qty: 1 });
  oo[activeTable] = arr;
  setOpenOrders(oo);
  renderOrder();
  renderTableStrip();
});

function renderOrder() {
  const heading = document.getElementById('orderHeading');
  heading.textContent = activeTable ? `Current Order — ${activeTable}` : 'Select a table to start order';

  const items = currentOrderItems();
  const list = document.getElementById('orderList');
  list.innerHTML = items.map(o => `
    <div class="order-item">
      <span class="oi-name">${escapeHtml(o.name)}</span>
      <div class="qty-controls">
        <button data-dec="${o.menuId}">−</button>
        <span>${o.qty}</span>
        <button data-inc="${o.menuId}">+</button>
      </div>
      <span class="oi-line-total">${rupee(o.price * o.qty)}</span>
    </div>`).join('') || `<div class="empty-hint">${activeTable ? 'No items added yet. Click menu items to add.' : 'Table select karke items add karein.'}</div>`;

  const subtotal = items.reduce((s, o) => s + o.price * o.qty, 0);
  const gstPct = parseFloat(document.getElementById('gstPct').value) || 0;
  const gst = subtotal * gstPct / 100;
  const total = subtotal + gst;
  document.getElementById('subtotalVal').textContent = rupee(subtotal);
  document.getElementById('gstVal').textContent = rupee(gst);
  document.getElementById('totalVal').textContent = rupee(total);
}

document.getElementById('orderList').addEventListener('click', (e) => {
  const inc = e.target.dataset.inc, dec = e.target.dataset.dec;
  const id = inc || dec;
  if (!id || !activeTable) return;
  const oo = getOpenOrders();
  let arr = oo[activeTable] || [];
  const line = arr.find(o => o.menuId === id);
  if (!line) return;
  if (inc) line.qty += 1;
  else { line.qty -= 1; if (line.qty <= 0) arr = arr.filter(o => o.menuId !== id); }
  oo[activeTable] = arr;
  setOpenOrders(oo);
  renderOrder();
  renderTableStrip();
});

document.getElementById('gstPct').addEventListener('input', renderOrder);

document.getElementById('clearOrderBtn').addEventListener('click', () => {
  if (!activeTable) return;
  const oo = getOpenOrders();
  delete oo[activeTable];
  setOpenOrders(oo);
  renderOrder();
  renderTableStrip();
});

document.getElementById('completeBillBtn').addEventListener('click', () => {
  if (!activeTable) { alert('Pehle ek table/token select karein.'); return; }
  const items = currentOrderItems();
  if (items.length === 0) { alert('Order khaali hai. Pehle items add karo.'); return; }
  const subtotal = items.reduce((s, o) => s + o.price * o.qty, 0);
  const gstPct = parseFloat(document.getElementById('gstPct').value) || 0;
  const gst = subtotal * gstPct / 100;
  const total = subtotal + gst;
  const bill = {
    id: uid(),
    ts: Date.now(),
    table: activeTable,
    items: items.map(o => ({ name: o.name, qty: o.qty, price: o.price })),
    subtotal, gstPct, gst, total,
    payment: document.getElementById('paymentMode').value
  };
  const bills = store.get('rm_bills', []);
  bills.push(bill);
  store.set('rm_bills', bills);

  showReceipt(bill);

  const oo = getOpenOrders();
  delete oo[activeTable];
  setOpenOrders(oo);
  renderOrder();
  renderTableStrip();
});

let modalBill = null;

function showReceipt(bill) {
  modalBill = bill;
  const name = store.get('rm_name', 'My Restaurant');
  const dt = new Date(bill.ts);
  const itemsHtml = bill.items.map(i => `
    <div class="r-line"><span>${escapeHtml(i.name)} x${i.qty}</span><span>${rupee(i.price * i.qty)}</span></div>
  `).join('');
  document.getElementById('receiptContent').innerHTML = `
    <div class="r-title">${escapeHtml(name)}</div>
    <div class="r-sub">${dt.toLocaleString('en-IN')}<br>Table/Token: ${escapeHtml(bill.table)}</div>
    <hr>
    ${itemsHtml}
    <hr>
    <div class="r-line"><span>Subtotal</span><span>${rupee(bill.subtotal)}</span></div>
    <div class="r-line"><span>GST (${bill.gstPct}%)</span><span>${rupee(bill.gst)}</span></div>
    <div class="r-line" style="font-weight:700;"><span>Total</span><span>${rupee(bill.total)}</span></div>
    <div class="r-line"><span>Payment</span><span>${escapeHtml(bill.payment)}</span></div>
    <hr>
    <div class="r-sub">Thank you, visit again!</div>
  `;
  document.getElementById('receiptModal').classList.remove('hidden');
}

document.getElementById('closeReceiptBtn').addEventListener('click', () => {
  document.getElementById('receiptModal').classList.add('hidden');
});
document.getElementById('printReceiptBtn').addEventListener('click', () => window.print());

function billToText(bill) {
  const name = store.get('rm_name', 'My Restaurant');
  const dt = new Date(bill.ts);
  const lines = [
    name,
    dt.toLocaleString('en-IN'),
    `Table/Token: ${bill.table}`,
    '-'.repeat(32),
    ...bill.items.map(i => `${i.name} x${i.qty}`.padEnd(24) + rupee(i.price * i.qty).padStart(8)),
    '-'.repeat(32),
    `Subtotal`.padEnd(24) + rupee(bill.subtotal).padStart(8),
    `GST (${bill.gstPct}%)`.padEnd(24) + rupee(bill.gst).padStart(8),
    `Total`.padEnd(24) + rupee(bill.total).padStart(8),
    `Payment: ${bill.payment}`,
    '-'.repeat(32),
    'Thank you, visit again!'
  ];
  return lines.join('\n');
}

document.getElementById('downloadReceiptBtn').addEventListener('click', () => {
  if (!modalBill) return;
  const text = billToText(modalBill);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const dt = new Date(modalBill.ts);
  const fname = `bill-${modalBill.table}-${dt.toISOString().slice(0,10)}-${modalBill.id.slice(-5)}.txt`;
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

/* ================= INVENTORY + STOCK LOG ================= */
function renderInventoryTable() {
  const inv = store.get('rm_inventory', []);
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = inv.map(item => {
    const low = item.qty <= item.min;
    return `<tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${item.qty}</td>
      <td>${item.min}</td>
      <td class="${low ? 'low-stock' : 'ok-stock'}">${low ? 'Low Stock!' : 'OK'}</td>
      <td><button class="btn secondary small" data-log-move="${item.id}">Log In/Out</button></td>
      <td><button class="link-btn" data-del-inv="${item.id}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-hint">No inventory items yet.</td></tr>`;
}

document.getElementById('inventoryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const inv = store.get('rm_inventory', []);
  inv.push({
    id: uid(),
    name: document.getElementById('invName').value.trim(),
    unit: document.getElementById('invUnit').value.trim(),
    qty: parseFloat(document.getElementById('invQty').value),
    min: parseFloat(document.getElementById('invMin').value)
  });
  store.set('rm_inventory', inv);
  e.target.reset();
  renderInventoryTable();
});

document.querySelector('#inventoryTable tbody').addEventListener('click', (e) => {
  const delId = e.target.dataset.delInv;
  if (delId) {
    store.set('rm_inventory', store.get('rm_inventory', []).filter(i => i.id !== delId));
    renderInventoryTable();
    return;
  }
  const logId = e.target.dataset.logMove;
  if (logId) openStockModal(logId);
});

function openStockModal(itemId) {
  const item = store.get('rm_inventory', []).find(i => i.id === itemId);
  if (!item) return;
  document.getElementById('stockItemId').value = itemId;
  document.getElementById('stockModalTitle').textContent = `Log Movement — ${item.name}`;
  document.getElementById('stockQty').value = '';
  document.getElementById('stockNote').value = '';
  document.getElementById('stockType').value = 'in';
  document.getElementById('stockModal').classList.remove('hidden');
}
document.getElementById('closeStockModalBtn').addEventListener('click', () => {
  document.getElementById('stockModal').classList.add('hidden');
});

document.getElementById('stockForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const itemId = document.getElementById('stockItemId').value;
  const inv = store.get('rm_inventory', []);
  const item = inv.find(i => i.id === itemId);
  if (!item) return;
  const type = document.getElementById('stockType').value;
  const qty = parseFloat(document.getElementById('stockQty').value);
  const note = document.getElementById('stockNote').value.trim();
  if (!qty || qty <= 0) return;

  item.qty = type === 'in' ? item.qty + qty : item.qty - qty;
  store.set('rm_inventory', inv);

  const log = store.get('rm_stock_log', []);
  log.push({ id: uid(), itemId, itemName: item.name, type, qty, note, date: todayStr() });
  store.set('rm_stock_log', log);

  document.getElementById('stockModal').classList.add('hidden');
  renderInventoryTable();
  renderStockLog();
});

function renderStockLog() {
  const log = store.get('rm_stock_log', []).slice().reverse().slice(0, 15);
  const tbody = document.querySelector('#stockLogTable tbody');
  tbody.innerHTML = log.map(l => `
    <tr>
      <td>${l.date}</td>
      <td>${escapeHtml(l.itemName)}</td>
      <td>${l.type === 'in' ? 'Stock In' : 'Stock Out'}</td>
      <td>${l.qty}</td>
      <td>${escapeHtml(l.note || '-')}</td>
    </tr>`).join('') || `<tr><td colspan="5" class="empty-hint">Koi movement log nahi hai abhi.</td></tr>`;
}

/* ================= EXPENSES ================= */
function renderExpenseTable() {
  const exp = store.get('rm_expenses', []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const tbody = document.querySelector('#expenseTable tbody');
  tbody.innerHTML = exp.map(x => `
    <tr>
      <td>${x.date}</td>
      <td>${escapeHtml(x.category)}</td>
      <td>${escapeHtml(x.note || '-')}</td>
      <td>${rupee(x.amount)}</td>
      <td><button class="link-btn" data-del-exp="${x.id}">Remove</button></td>
    </tr>`).join('') || `<tr><td colspan="5" class="empty-hint">No expenses recorded yet.</td></tr>`;
}

document.getElementById('expDate').value = todayStr();

document.getElementById('expenseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const exp = store.get('rm_expenses', []);
  exp.push({
    id: uid(),
    date: document.getElementById('expDate').value,
    category: document.getElementById('expCategory').value,
    note: document.getElementById('expNote').value.trim(),
    amount: parseFloat(document.getElementById('expAmount').value)
  });
  store.set('rm_expenses', exp);
  e.target.reset();
  document.getElementById('expDate').value = todayStr();
  renderExpenseTable();
});

document.querySelector('#expenseTable tbody').addEventListener('click', (e) => {
  const id = e.target.dataset.delExp;
  if (!id) return;
  store.set('rm_expenses', store.get('rm_expenses', []).filter(x => x.id !== id));
  renderExpenseTable();
});

/* ================= STAFF & SALARY ================= */
// Months elapsed (inclusive) between a staff's join month and the current month.
function monthsElapsed(joinDate) {
  const j = new Date(joinDate + 'T00:00:00');
  const now = new Date();
  return (now.getFullYear() - j.getFullYear()) * 12 + (now.getMonth() - j.getMonth()) + 1;
}

function renderStaff() {
  const staff = store.get('rm_staff', []);
  const payments = store.get('rm_salary_payments', []);
  const tbody = document.querySelector('#staffTable tbody');
  tbody.innerHTML = staff.map(s => {
    const totalPaid = payments.filter(p => p.staffId === s.id).reduce((sum, p) => sum + p.amount, 0);
    const totalDue = s.salary * monthsElapsed(s.joinDate || todayStr());
    const balance = totalDue - totalPaid;
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.role)}</td>
      <td>${rupee(s.salary)}</td>
      <td>${rupee(totalDue)}</td>
      <td>${rupee(totalPaid)}</td>
      <td class="${balance > 0 ? 'low-stock' : 'ok-stock'}">${balance > 0 ? rupee(balance) + ' pending' : rupee(-balance) + ' advance'}</td>
      <td>
        <button class="btn secondary small" data-pay="${s.id}">Pay Salary</button>
        <button class="btn secondary small" data-history="${s.id}">History</button>
        <button class="link-btn" data-del-staff="${s.id}">Remove</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-hint">Koi staff add nahi kiya abhi.</td></tr>`;

  const logBody = document.querySelector('#salaryLogTable tbody');
  logBody.innerHTML = payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 15).map(p => `
    <tr>
      <td>${p.date}</td>
      <td>${escapeHtml(p.staffName)}</td>
      <td>${rupee(p.amount)}</td>
      <td>${escapeHtml(p.note || '-')}</td>
    </tr>`).join('') || `<tr><td colspan="4" class="empty-hint">Koi payment log nahi hai abhi.</td></tr>`;
}

document.getElementById('staffForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const staff = store.get('rm_staff', []);
  staff.push({
    id: uid(),
    name: document.getElementById('staffName').value.trim(),
    role: document.getElementById('staffRole').value.trim(),
    salary: parseFloat(document.getElementById('staffSalary').value),
    joinDate: todayStr()
  });
  store.set('rm_staff', staff);
  e.target.reset();
  renderStaff();
});

document.querySelector('#staffTable tbody').addEventListener('click', (e) => {
  const delId = e.target.dataset.delStaff;
  if (delId) {
    if (!confirm('Ye staff member remove karein? Payment history save rahegi.')) return;
    store.set('rm_staff', store.get('rm_staff', []).filter(s => s.id !== delId));
    renderStaff();
    return;
  }
  const payId = e.target.dataset.pay;
  if (payId) { openSalaryModal(payId); return; }
  const histId = e.target.dataset.history;
  if (histId) openHistoryModal(histId);
});

function openHistoryModal(staffId) {
  const staff = store.get('rm_staff', []).find(s => s.id === staffId);
  if (!staff) return;
  const payments = store.get('rm_salary_payments', [])
    .filter(p => p.staffId === staffId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalDue = staff.salary * monthsElapsed(staff.joinDate || todayStr());
  const balance = totalDue - totalPaid;

  document.getElementById('historyModalTitle').textContent = `Payment History — ${staff.name}`;
  document.getElementById('historySummary').innerHTML = `
    <div class="h-stat"><span class="h-label">Monthly Salary</span><span class="h-value">${rupee(staff.salary)}</span></div>
    <div class="h-stat"><span class="h-label">Total Paid</span><span class="h-value">${rupee(totalPaid)}</span></div>
    <div class="h-stat"><span class="h-label">${balance > 0 ? 'Pending' : 'Advance'}</span><span class="h-value">${rupee(Math.abs(balance))}</span></div>
  `;
  document.querySelector('#historyTable tbody').innerHTML = payments.map(p => `
    <tr>
      <td>${p.date}</td>
      <td>${rupee(p.amount)}</td>
      <td>${escapeHtml(p.note || '-')}</td>
    </tr>`).join('') || `<tr><td colspan="3" class="empty-hint">Abhi tak koi payment nahi hua.</td></tr>`;

  document.getElementById('historyModal').classList.remove('hidden');
}
document.getElementById('closeHistoryModalBtn').addEventListener('click', () => {
  document.getElementById('historyModal').classList.add('hidden');
});

function openSalaryModal(staffId) {
  const staff = store.get('rm_staff', []).find(s => s.id === staffId);
  if (!staff) return;
  document.getElementById('salaryStaffId').value = staffId;
  document.getElementById('salaryModalTitle').textContent = `Pay Salary — ${staff.name}`;
  document.getElementById('salaryDate').value = todayStr();
  document.getElementById('salaryAmount').value = '';
  document.getElementById('salaryNote').value = '';
  document.getElementById('salaryModal').classList.remove('hidden');
}
document.getElementById('closeSalaryModalBtn').addEventListener('click', () => {
  document.getElementById('salaryModal').classList.add('hidden');
});

document.getElementById('salaryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const staffId = document.getElementById('salaryStaffId').value;
  const staff = store.get('rm_staff', []).find(s => s.id === staffId);
  if (!staff) return;
  const amount = parseFloat(document.getElementById('salaryAmount').value);
  const date = document.getElementById('salaryDate').value;
  const note = document.getElementById('salaryNote').value.trim();
  if (!amount || amount <= 0) return;

  const payments = store.get('rm_salary_payments', []);
  payments.push({ id: uid(), staffId, staffName: staff.name, date, amount, note });
  store.set('rm_salary_payments', payments);

  const exp = store.get('rm_expenses', []);
  exp.push({ id: uid(), date, category: 'Staff Salary', note: `Salary paid to ${staff.name}${note ? ' - ' + note : ''}`, amount });
  store.set('rm_expenses', exp);

  document.getElementById('salaryModal').classList.add('hidden');
  renderStaff();
  renderExpenseTable();
});

/* ================= DASHBOARD ================= */
let currentRange = 'today';
document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    renderDashboard();
  });
});

function rangeStart(range) {
  const now = new Date();
  if (range === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime(); }
  if (range === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0); return d.getTime(); }
  if (range === 'month') { const d = new Date(now.getFullYear(), now.getMonth(), 1); return d.getTime(); }
  return 0;
}

function renderDashboard() {
  const bills = store.get('rm_bills', []);
  const expenses = store.get('rm_expenses', []);
  const start = rangeStart(currentRange);

  const filteredBills = bills.filter(b => b.ts >= start);
  const filteredExp = expenses.filter(x => new Date(x.date + 'T00:00:00').getTime() >= start);

  const revenue = filteredBills.reduce((s, b) => s + b.total, 0);
  const expTotal = filteredExp.reduce((s, x) => s + x.amount, 0);
  const profit = revenue - expTotal;

  document.getElementById('revVal').textContent = rupee(revenue);
  document.getElementById('expVal').textContent = rupee(expTotal);
  document.getElementById('profitVal').textContent = rupee(profit);
  document.getElementById('profitVal').style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('billCountVal').textContent = filteredBills.length;

  renderBarChart(bills, expenses);

  const recentBillsBody = document.querySelector('#recentBillsTable tbody');
  recentBillsBody.innerHTML = bills.slice().sort((a,b)=>b.ts-a.ts).slice(0, 8).map(b => `
    <tr class="clickable-row" data-view-bill="${b.id}">
      <td>${new Date(b.ts).toLocaleString('en-IN', {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'})}</td>
      <td>${escapeHtml(b.table)}</td>
      <td>${b.items.length} item(s)</td>
      <td>${rupee(b.total)}</td>
    </tr>`).join('') || `<tr><td colspan="4" class="empty-hint">No bills yet.</td></tr>`;

  const recentExpBody = document.querySelector('#recentExpensesTable tbody');
  recentExpBody.innerHTML = expenses.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 8).map(x => `
    <tr>
      <td>${x.date}</td>
      <td>${escapeHtml(x.category)}</td>
      <td>${escapeHtml(x.note || '-')}</td>
      <td>${rupee(x.amount)}</td>
    </tr>`).join('') || `<tr><td colspan="4" class="empty-hint">No expenses yet.</td></tr>`;
}

function renderBarChart(bills, expenses) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0,0,0,0);
    days.push(d);
  }
  const dayData = days.map(d => {
    const next = d.getTime() + 86400000;
    const rev = bills.filter(b => b.ts >= d.getTime() && b.ts < next).reduce((s,b)=>s+b.total,0);
    const exp = expenses.filter(x => {
      const t = new Date(x.date + 'T00:00:00').getTime();
      return t >= d.getTime() && t < next;
    }).reduce((s,x)=>s+x.amount,0);
    return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), rev, exp };
  });
  const max = Math.max(1, ...dayData.map(d => Math.max(d.rev, d.exp)));
  const chart = document.getElementById('barChart');
  chart.innerHTML = dayData.map(d => `
    <div class="bar-day">
      <div class="bar-stack">
        <div class="bar rev" style="height:${(d.rev/max*140).toFixed(0)}px" title="Revenue: ${rupee(d.rev)}"></div>
        <div class="bar exp" style="height:${(d.exp/max*140).toFixed(0)}px" title="Expense: ${rupee(d.exp)}"></div>
      </div>
      <span class="day-label">${d.label}</span>
    </div>`).join('');
}

document.querySelector('#recentBillsTable tbody').addEventListener('click', (e) => {
  const id = e.target.closest('tr')?.dataset.viewBill;
  if (!id) return;
  const bill = store.get('rm_bills', []).find(b => b.id === id);
  if (bill) showReceipt(bill);
});

/* ---------- Init ---------- */
seedIfEmpty();
renderMenuTable();
renderMenuGrid();
renderTableStrip();
renderOrder();
renderInventoryTable();
renderStockLog();
renderExpenseTable();
renderStaff();
renderDashboard();
