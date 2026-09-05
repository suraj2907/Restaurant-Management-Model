import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, setSetting } from './lib/db.js';
import { downloadBackup, readBackupFile, applyBackup } from './lib/backup.js';
import { downloadExcel } from './lib/exportExcel.js';
import { useSupabaseTable } from './lib/useSupabaseTable.js';
import Icon from './components/Icons.jsx';
import { Skeleton } from './components/Skeleton.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';

// The 5 tabs a counter/floor staffer reaches for constantly during service -
// pinned to a bottom tab bar on mobile. Everything else lives behind "More".
const MOBILE_PRIMARY_TABS = ['billing', 'kitchen', 'reservations', 'staff', 'audit'];
const MOBILE_TAB_SHORT_LABEL = { billing: 'POS/Order', kitchen: 'KOT Live', reservations: 'Bookings', staff: 'Staff', audit: 'Hisaab' };

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
const KitchenDisplayTab = lazy(() => import('./tabs/KitchenDisplayTab.jsx'));
const CashAuditTab = lazy(() => import('./tabs/CashAuditTab.jsx'));

const TABS = [
  { id: 'billing', label: 'Billing', icon: 'billing' },
  { id: 'kitchen', label: 'Kitchen Display', icon: 'kitchen' },
  { id: 'reservations', label: 'Reservations', icon: 'reservations' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'audit', label: 'Cash Audit', icon: 'audit' },
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
  const [pendingRestore, setPendingRestore] = useState(null);
  const fileInputRef = useRef(null);
  const [kotTickets] = useSupabaseTable('kot_tickets', []);
  const activeKotCount = useMemo(() => kotTickets.filter((k) => k.status === 'active').length, [kotTickets]);

  useEffect(() => {
    getSetting('rm_name', 'My Restaurant').then(setName);
  }, []);

  useEffect(() => {
    document.title = `${name} — Manager`;
    const timeout = setTimeout(() => setSetting('rm_name', name), 600);
    return () => clearTimeout(timeout);
  }, [name]);

  const handleNameChange = useCallback((e) => setName(e.target.value), []);

  const handleRestoreFile = useCallback(async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const parsed = await readBackupFile(file);
    if (parsed) setPendingRestore(parsed);
  }, []);

  const confirmRestore = useCallback(() => {
    applyBackup(pendingRestore, () => location.reload());
    setPendingRestore(null);
  }, [pendingRestore]);

  const selectTab = useCallback((id) => {
    setActiveTab(id);
    setNavOpen(false);
  }, []);

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
        <header className="sm:hidden flex items-center gap-2.5 px-4 py-3 bg-surface border-b border-border">
          <span className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-extrabold text-sm shrink-0">
            {(name || 'R')[0].toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block font-bold text-sm text-ink truncate">{name}</span>
            <span className="flex items-center gap-1 text-[0.68rem] text-muted">
              <span className={`w-1.5 h-1.5 rounded-full ${activeKotCount > 0 ? 'bg-good animate-pulse' : 'bg-border'}`} />
              {activeKotCount > 0 ? `Kitchen Active (${activeKotCount})` : 'Counter Active'}
            </span>
          </div>
          <button
            onClick={() => setNavOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg border border-border shrink-0"
            aria-label="More options"
          >
            <Icon name="hamburger" className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-5 pb-24 sm:pb-14">
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'billing' && <BillingTab restaurantName={name} />}
            {activeTab === 'kitchen' && <KitchenDisplayTab />}
            {activeTab === 'reservations' && <ReservationsTab />}
            {activeTab === 'dashboard' && <DashboardTab restaurantName={name} />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'audit' && <CashAuditTab />}
            {activeTab === 'inventory' && <InventoryTab />}
            {activeTab === 'expenses' && <ExpensesTab />}
            {activeTab === 'staff' && <StaffTab />}
            {activeTab === 'vendors' && <VendorsTab />}
            {activeTab === 'customers' && <CustomersTab />}
            {activeTab === 'menu' && <MenuTab />}
          </Suspense>
        </main>

        {/* Mobile bottom tab bar - the 5 destinations used constantly during
            service; everything else lives behind the "More" drawer above. */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border flex items-stretch shadow-panel">
          {MOBILE_PRIMARY_TABS.map((id) => {
            const t = TABS.find((x) => x.id === id);
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => selectTab(id)}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[0.62rem] font-semibold ${isActive ? 'text-accent' : 'text-muted'}`}
              >
                {id === 'kitchen' && activeKotCount > 0 && (
                  <span className="absolute top-1 right-1/4 min-w-[16px] h-4 px-1 rounded-full bg-bad text-white text-[0.55rem] font-bold flex items-center justify-center">
                    {activeKotCount}
                  </span>
                )}
                <Icon name={t.icon} className="w-5 h-5" />
                {MOBILE_TAB_SHORT_LABEL[id]}
              </button>
            );
          })}
        </nav>
      </div>

      <ConfirmModal
        open={!!pendingRestore}
        title="Restore Backup"
        message="Ye backup load karega. Current data overwrite ho jaayega - continue karein?"
        confirmLabel="Yes, Restore"
        onConfirm={confirmRestore}
        onCancel={() => setPendingRestore(null)}
      />
    </div>
  );
}
