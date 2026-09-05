import * as XLSX from 'xlsx';
import { todayStr, monthsElapsed } from './store.js';
import { supabase } from './supabase.js';
import { toCamel } from './useSupabaseTable.js';

function sheetFrom(rows) {
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
}

async function fetchAll(table) {
  const { data } = await supabase.from(table).select('*');
  return (data || []).map(toCamel);
}

export async function downloadExcel() {
  const [bills, expenses, inventory, stockLog, vendors, vendorPurchases, vendorPayments, staff, salaryPayments, customers, menu, customerCredit, dailyTips, cashAudits] =
    await Promise.all([
      fetchAll('bills'), fetchAll('expenses'), fetchAll('inventory'), fetchAll('stock_log'),
      fetchAll('vendors'), fetchAll('vendor_purchases'), fetchAll('vendor_payments'),
      fetchAll('staff'), fetchAll('salary_payments'), fetchAll('customers'), fetchAll('menu'),
      fetchAll('customer_credit'), fetchAll('daily_tips'), fetchAll('cash_audits')
    ]);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, sheetFrom(bills.map((b) => ({
    Date: new Date(b.ts).toLocaleString('en-IN'),
    Table: b.table,
    Items: (b.items || []).map((i) => `${i.name} x${i.qty}`).join(', '),
    Subtotal: b.subtotal,
    'GST %': b.gstPct,
    GST: b.gst,
    Total: b.total,
    Payment: b.payment,
    'Served By': b.staffName || '',
    'Customer Phone': customers.find((c) => c.id === b.customerId)?.phone || ''
  }))), 'Bills');

  XLSX.utils.book_append_sheet(wb, sheetFrom(expenses.map((x) => ({
    Date: x.date, Category: x.category, Note: x.note, Amount: x.amount
  }))), 'Expenses');

  XLSX.utils.book_append_sheet(wb, sheetFrom(inventory.map((i) => ({
    Item: i.name, Unit: i.unit, Stock: i.qty, 'Min Level': i.min,
    'Cost/Unit': i.cost || 0, Value: i.qty * (i.cost || 0),
    Status: i.qty <= i.min ? 'Low Stock' : 'OK'
  }))), 'Inventory');

  XLSX.utils.book_append_sheet(wb, sheetFrom(stockLog.map((l) => ({
    Date: l.date, Item: l.itemName, Type: l.type === 'in' ? 'Stock In' : 'Stock Out',
    Qty: l.qty, Vendor: l.vendor || '', Note: l.note || ''
  }))), 'Stock Movements');

  XLSX.utils.book_append_sheet(wb, sheetFrom(vendors.map((v) => {
    const purchased = vendorPurchases.filter((p) => p.vendorId === v.id).reduce((s, p) => s + p.amount, 0);
    const paid = vendorPayments.filter((p) => p.vendorId === v.id).reduce((s, p) => s + p.amount, 0);
    return {
      Vendor: v.name, Contact: v.contact || '', 'Opening Balance': v.openingBalance,
      Purchases: purchased, Paid: paid, 'Balance Due': v.openingBalance + purchased - paid
    };
  })), 'Vendors');

  XLSX.utils.book_append_sheet(wb, sheetFrom(vendorPurchases.map((p) => ({
    Date: p.date, Vendor: p.vendorName, Item: p.itemName, Qty: p.qty, Unit: p.unit, Amount: p.amount, Note: p.note || ''
  }))), 'Vendor Purchases');

  XLSX.utils.book_append_sheet(wb, sheetFrom(vendorPayments.map((p) => ({
    Date: p.date, Vendor: p.vendorName, Amount: p.amount, Note: p.note || ''
  }))), 'Vendor Payments');

  XLSX.utils.book_append_sheet(wb, sheetFrom(staff.map((s) => {
    const paid = salaryPayments.filter((p) => p.staffId === s.id).reduce((sum, p) => sum + p.amount, 0);
    const due = s.salary * monthsElapsed(s.joinDate || todayStr());
    return {
      Name: s.name, Role: s.role, 'Monthly Salary': s.salary,
      'Total Due': due, 'Total Paid': paid, Balance: due - paid
    };
  })), 'Staff');

  XLSX.utils.book_append_sheet(wb, sheetFrom(salaryPayments.map((p) => ({
    Date: p.date, Staff: p.staffName, Amount: p.amount, Note: p.note || ''
  }))), 'Salary Payments');

  XLSX.utils.book_append_sheet(wb, sheetFrom(customers.map((c) => {
    const charged = customerCredit.filter((u) => u.customerId === c.id && u.type === 'charge').reduce((s, u) => s + u.amount, 0);
    const settled = customerCredit.filter((u) => u.customerId === c.id && u.type === 'payment').reduce((s, u) => s + u.amount, 0);
    return {
      Name: c.name, Phone: c.phone, Visits: c.visits, 'Total Spent': c.totalSpent, Points: c.points,
      'Udhar Balance': charged - settled
    };
  })), 'Customers');

  XLSX.utils.book_append_sheet(wb, sheetFrom(customerCredit.map((u) => ({
    Date: u.date, Customer: u.customerName, Type: u.type === 'charge' ? 'Udhar Diya' : 'Udhar Wasooli', Amount: u.amount, Note: u.note || ''
  }))), 'Customer Udhar');

  XLSX.utils.book_append_sheet(wb, sheetFrom(menu.map((m) => ({
    Item: m.name, Category: m.category, Price: m.price, Cost: m.cost || 0,
    'Margin %': m.price ? Math.round(((m.price - (m.cost || 0)) / m.price) * 100) : 0,
    Type: m.veg === false ? 'Non-Veg' : 'Veg',
    Status: m.available === false ? '86 - Out of Stock' : 'Available'
  }))), 'Menu');

  XLSX.utils.book_append_sheet(wb, sheetFrom(dailyTips.map((t) => ({
    Date: t.date, Amount: t.amount, Note: t.note || ''
  }))), 'Daily Tips');

  XLSX.utils.book_append_sheet(wb, sheetFrom(cashAudits.map((a) => ({
    Date: a.date, 'Counted Cash': a.countedCash, Note: a.note || ''
  }))), 'Cash Audits');

  XLSX.writeFile(wb, `restaurant-data-${todayStr()}.xlsx`);
}
