import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { getSetting, setSetting } from './lib/db.js';
import { downloadBackup, restoreBackup } from './lib/backup.js';
import { downloadExcel } from './lib/exportExcel.js';
import Icon from './components/Icons.jsx';
import { Skeleton } from './components/Skeleton.jsx';

// Code-split each tab into its own chunk - only the active tab (plus
// whichever ones have been visited) is ever downloaded, instead of one
// ~700KB bundle up front.
const BillingTab = lazy(() => import('./tabs/BillingTab.jsx'));
const DashboardTab = lazy(() => import('./tabs/DashboardTab.jsx'));
const ReportsTab = lazy(() => import('./tabs/ReportsTab.jsx'));
const ReservationsTab = lazy(() => import('./tabs/ReservationsTab.jsx'));
const InventoryTab = lazy(() => import('./tabs/InventoryTab.jsx'));
const ExpensesTab = lazy(() => import('./tabs/ExpensesTab.jsx'));
const StaffTab = lazy(() => import('./tabs/StaffTab.jsx'));
const VendorsTab = lazy(() => import('./tabs/VendorsTab.jsx'));
const CustomersTab = lazy(() => import('./tabs/CustomersTab.jsx'));
const MenuTab = lazy(() => import('./tabs/MenuTab.jsx'));

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

function TabFallback() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// Defined outside App (and memoized) so it isn't torn down and rebuilt as a
// "new" component type on every App re-render - e.g. every keystroke in the
// restaurant-name input used to remount the whole sidebar + its nav buttons.
const SidebarNav = memo(function SidebarNav({ name, onNameChange, activeTab, onNavigate, utilityButtons }) {
  return (
    <>
      <div className="p-4 border-b border-border bg-well/50">
        <input
          className="w-full text-base font-bold text-accent bg-transparent px-1 py-1 rounded-md focus:outline focus:outline-2 focus:outline-accent focus:bg-surface"
          value={name}
          onChange={onNameChange}
          spellCheck={false}
        />
      </div>
      <nav className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onNavigate(t.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${
              activeTab === t.id ? 'bg-accent text-white shadow-tile' : 'text-muted hover:bg-well hover:text-ink'
            }`}
          >
            <Icon name={t.icon} className="w-4 h-4 shrink-0" />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="p-2.5 border-t border-border bg-well/50 flex flex-col gap-1.5">
        {utilityButtons}
      </div>
    </>
  );
});

export default function App() {
  const [activeTab, setActiveTab] = useState('billing');
  const [name, setName] = useState('My Restaurant');
  const [navOpen, setNavOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    getSetting('rm_name', 'My Restaurant').then(setName);
  }, []);

  useEffect(() => {
    document.title = `${name} — Manager`;
    const timeout = setTimeout(() => setSetting('rm_name', name), 600);
    return () => clearTimeout(timeout);
  }, [name]);

  const handleNameChange = useCallback((e) => setName(e.target.value), []);

  const handleRestoreFile = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    restoreBackup(file, () => location.reload());
    e.target.value = '';
  }, []);

  const selectTab = useCallback((id) => {
    setActiveTab(id);
    setNavOpen(false);
  }, []);

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

  return (
    <div className="flex min-h-screen">
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleRestoreFile} />

      {/* Desktop persistent sidebar */}
      <aside className="hidden sm:flex sm:flex-col w-56 shrink-0 bg-surface border-r border-border h-screen sticky top-0">
        <SidebarNav name={name} onNameChange={handleNameChange} activeTab={activeTab} onNavigate={selectTab} utilityButtons={utilityButtons} />
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
            <SidebarNav name={name} onNameChange={handleNameChange} activeTab={activeTab} onNavigate={selectTab} utilityButtons={utilityButtons} />
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
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'billing' && <BillingTab restaurantName={name} />}
            {activeTab === 'reservations' && <ReservationsTab />}
            {activeTab === 'dashboard' && <DashboardTab restaurantName={name} />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'inventory' && <InventoryTab />}
            {activeTab === 'expenses' && <ExpensesTab />}
            {activeTab === 'staff' && <StaffTab />}
            {activeTab === 'vendors' && <VendorsTab />}
            {activeTab === 'customers' && <CustomersTab />}
            {activeTab === 'menu' && <MenuTab />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
