import { useEffect, useRef, useState } from 'react';
import { store } from './lib/store.js';
import { downloadBackup, restoreBackup } from './lib/backup.js';
import { downloadExcel } from './lib/exportExcel.js';
import Icon from './components/Icons.jsx';
import BillingTab from './tabs/BillingTab.jsx';
import DashboardTab from './tabs/DashboardTab.jsx';
import ReportsTab from './tabs/ReportsTab.jsx';
import ReservationsTab from './tabs/ReservationsTab.jsx';
import InventoryTab from './tabs/InventoryTab.jsx';
import ExpensesTab from './tabs/ExpensesTab.jsx';
import StaffTab from './tabs/StaffTab.jsx';
import VendorsTab from './tabs/VendorsTab.jsx';
import CustomersTab from './tabs/CustomersTab.jsx';
import MenuTab from './tabs/MenuTab.jsx';

const TABS = [
  { id: 'billing', label: 'Billing', icon: 'billing' },
  { id: 'reservations', label: 'Reservations', icon: 'reservations' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'expenses', label: 'Expenses', icon: 'expenses' },
  { id: 'staff', label: 'Staff', icon: 'staff' },
  { id: 'vendors', label: 'Vendors', icon: 'vendors' },
  { id: 'customers', label: 'Customers', icon: 'customers' },
  { id: 'menu', label: 'Menu Setup', icon: 'menu' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('billing');
  const [name, setName] = useState(() => store.get('rm_name', 'My Restaurant'));
  const fileInputRef = useRef(null);

  useEffect(() => {
    store.set('rm_name', name);
    document.title = `${name} — Manager`;
  }, [name]);

  function handleRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    restoreBackup(file, () => location.reload());
    e.target.value = '';
  }

  const tabContent = {
    billing: <BillingTab restaurantName={name} />,
    reservations: <ReservationsTab />,
    dashboard: <DashboardTab />,
    reports: <ReportsTab />,
    inventory: <InventoryTab />,
    expenses: <ExpensesTab />,
    staff: <StaffTab />,
    vendors: <VendorsTab />,
    customers: <CustomersTab />,
    menu: <MenuTab />
  };

  const utilityButtons = (extraClass = '') => (
    <>
      <button onClick={downloadExcel} className={`px-3 py-2 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink text-left ${extraClass}`} title="Bills, expenses, inventory, vendors, staff, customers - sab Excel file mein">
        Export Excel
      </button>
      <button onClick={downloadBackup} className={`px-3 py-2 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink text-left ${extraClass}`} title="Pura data ek file mein download karein (app mein restore karne ke liye)">
        Backup Data
      </button>
      <button onClick={() => fileInputRef.current?.click()} className={`px-3 py-2 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink text-left ${extraClass}`} title="Pehle se saved backup file se data restore karein">
        Restore Data
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleRestoreFile} />

      {/* Desktop left sidebar */}
      <aside className="hidden sm:flex sm:flex-col w-56 shrink-0 bg-surface border-r border-border h-screen sticky top-0">
        <div className="p-4 border-b border-border">
          <input
            className="w-full text-base font-bold text-accent-dark bg-transparent px-1 py-1 rounded-md focus:outline focus:outline-2 focus:outline-accent focus:bg-bg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
          />
        </div>
        <nav className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-left ${
                activeTab === t.id ? 'bg-accent text-white' : 'text-muted hover:bg-bg hover:text-ink'
              }`}
            >
              <Icon name={t.icon} className="w-4 h-4 shrink-0" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-2.5 border-t border-border flex flex-col gap-1.5">
          {utilityButtons()}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="sm:hidden flex flex-col gap-2.5 px-4 py-3 bg-surface border-b border-border">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <input
              className="text-lg font-bold text-accent-dark bg-transparent px-1 py-1 rounded-md max-w-[55vw] focus:outline focus:outline-2 focus:outline-accent focus:bg-bg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
            />
            <div className="flex items-center gap-1.5">
              {utilityButtons('!px-2.5 !py-1.5')}
            </div>
          </div>
          <nav className="flex gap-1.5 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                  activeTab === t.id ? 'bg-accent text-white border-accent' : 'bg-bg text-muted border-border'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-5 pb-14">
          {tabContent[activeTab]}
        </main>
      </div>
    </div>
  );
}
