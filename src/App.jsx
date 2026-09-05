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
  const [navOpen, setNavOpen] = useState(false);
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

  function selectTab(id) {
    setActiveTab(id);
    setNavOpen(false);
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

  const currentTab = TABS.find((t) => t.id === activeTab);

  const utilityButtons = (
    <>
      <button onClick={downloadExcel} className="px-3 py-2 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink text-left" title="Bills, expenses, inventory, vendors, staff, customers - sab Excel file mein">
        Export Excel
      </button>
      <button onClick={downloadBackup} className="px-3 py-2 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink text-left" title="Pura data ek file mein download karein (app mein restore karne ke liye)">
        Backup Data
      </button>
      <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink text-left" title="Pehle se saved backup file se data restore karein">
        Restore Data
      </button>
    </>
  );

  // Shared between the persistent desktop sidebar and the mobile slide-in drawer.
  function SidebarNav({ onNavigate }) {
    return (
      <>
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
              onClick={() => onNavigate(t.id)}
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
          {utilityButtons}
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen">
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleRestoreFile} />

      {/* Desktop persistent sidebar */}
      <aside className="hidden sm:flex sm:flex-col w-56 shrink-0 bg-surface border-r border-border h-screen sticky top-0">
        <SidebarNav onNavigate={selectTab} />
      </aside>

      {/* Mobile slide-in drawer */}
      {navOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setNavOpen(false)} />
          <aside className="relative flex flex-col w-64 max-w-[80vw] h-full bg-surface border-r border-border">
            <button
              onClick={() => setNavOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-bg border border-border"
              aria-label="Close menu"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
            <SidebarNav onNavigate={selectTab} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="sm:hidden flex items-center gap-3 px-4 py-3 bg-surface border-b border-border">
          <button
            onClick={() => setNavOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg border border-border shrink-0"
            aria-label="Open menu"
          >
            <Icon name="hamburger" className="w-5 h-5" />
          </button>
          <span className="flex items-center gap-2 font-semibold text-sm text-ink min-w-0">
            <Icon name={currentTab.icon} className="w-4 h-4 shrink-0 text-accent-dark" />
            <span className="truncate">{currentTab.label}</span>
          </span>
        </header>

        <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-5 pb-14">
          {tabContent[activeTab]}
        </main>
      </div>
    </div>
  );
}
