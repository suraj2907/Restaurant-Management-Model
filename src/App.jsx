import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { getSetting, setSetting } from './lib/db.js';
import { getProfile, signOut } from './lib/auth.js';
import { downloadBackup, readBackupFile, applyBackup } from './lib/backup.js';
import { downloadExcel } from './lib/exportExcel.js';
import { uploadLogo } from './lib/storage.js';
import { useSupabaseTable } from './lib/useSupabaseTable.js';
import Icon from './components/Icons.jsx';
import { Skeleton } from './components/Skeleton.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import Modal, { ModalActions, Btn } from './components/Modal.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import CustomerOrderPage from './components/CustomerOrderPage.jsx';

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
const UserManagementTab = lazy(() => import('./tabs/UserManagementTab.jsx'));
const PermissionsTab = lazy(() => import('./tabs/PermissionsTab.jsx'));
const KotHistoryTab = lazy(() => import('./tabs/KotHistoryTab.jsx'));
const PrinterSettingsTab = lazy(() => import('./tabs/PrinterSettingsTab.jsx'));
const PrintHistoryTab = lazy(() => import('./tabs/PrintHistoryTab.jsx'));

// Grouped under section headers in the sidebar so a Super Admin's 14 tabs
// don't read as one flat undifferentiated list - each tab keeps its id/
// label/icon, just tagged with which group it renders under.
const TABS = [
  { id: 'billing', label: 'Billing', icon: 'billing', section: 'Operations' },
  { id: 'kitchen', label: 'Kitchen Display', icon: 'kitchen', section: 'Operations' },
  { id: 'reservations', label: 'Reservations', icon: 'reservations', section: 'Operations' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', section: 'Insights' },
  { id: 'reports', label: 'Reports', icon: 'reports', section: 'Insights' },
  { id: 'audit', label: 'Cash Audit', icon: 'audit', section: 'Insights' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory', section: 'Management' },
  { id: 'expenses', label: 'Expenses', icon: 'expenses', section: 'Management' },
  { id: 'staff', label: 'Staff', icon: 'staff', section: 'Management' },
  { id: 'vendors', label: 'Vendors', icon: 'vendors', section: 'Management' },
  { id: 'customers', label: 'Customers', icon: 'customers', section: 'Management' },
  { id: 'menu', label: 'Menu Setup', icon: 'menu', section: 'Management' }
];
const USERS_TAB = { id: 'users', label: 'Team / Users', icon: 'users', section: 'Admin' };
const PERMISSIONS_TAB = { id: 'permissions', label: 'Admin Permissions', icon: 'permissions', section: 'Admin' };
const CAPTAIN_PERMISSIONS_TAB = { id: 'captain_permissions', label: 'Captain Permissions', icon: 'permissions', section: 'Admin' };
// KOT History isn't tied to a role_permissions resource (it's a
// permanent audit view derived from kot_tickets, not a distinct
// writable resource) - always visible to Admin/Super Admin, same tier
// as Team/Users below. Printer Settings and Print History are strictly
// Admin/Super Admin per the printing system's own security requirements.
const KOT_HISTORY_TAB = { id: 'kot_history', label: 'KOT History', icon: 'kitchen', section: 'Operations' };
const PRINTER_SETTINGS_TAB = { id: 'printer_settings', label: 'Printer Settings', icon: 'printer', section: 'Admin' };
const PRINT_HISTORY_TAB = { id: 'print_history', label: 'Print History', icon: 'reports', section: 'Admin' };
const SECTION_ORDER = ['Operations', 'Insights', 'Management', 'Admin'];

function TabFallback() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function FullPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <Skeleton className="h-8 w-40" />
    </div>
  );
}

// Defined outside App (and memoized) so it isn't torn down and rebuilt as a
// "new" component type on every App re-render - e.g. every keystroke in the
// restaurant-name input used to remount the whole sidebar + its nav buttons.
const SidebarNav = memo(function SidebarNav({ name, onNameChange, logoUrl, activeTab, onNavigate, utilityButtons, tabs }) {
  return (
    <>
      <div className="p-4 border-b border-border bg-well/50 flex items-center gap-2.5">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border" />
        ) : (
          <span className="w-9 h-9 rounded-lg bg-accent text-white flex items-center justify-center font-extrabold text-sm shrink-0">
            {(name || 'R')[0].toUpperCase()}
          </span>
        )}
        <input
          className="min-w-0 flex-1 text-base font-bold text-accent bg-transparent px-1 py-1 rounded-md focus:outline focus:outline-2 focus:outline-accent focus:bg-surface"
          value={name}
          onChange={onNameChange}
          spellCheck={false}
        />
      </div>
      <nav className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-3">
        {SECTION_ORDER.map((section) => {
          const sectionTabs = tabs.filter((t) => t.section === section);
          if (!sectionTabs.length) return null;
          return (
            <div key={section} className="flex flex-col gap-1">
              <p className="px-3 pb-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted/60">{section}</p>
              {sectionTabs.map((t) => (
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
            </div>
          );
        })}
      </nav>
      <div className="p-2.5 border-t border-border bg-well/50 flex flex-col gap-1.5">
        {utilityButtons}
      </div>
    </>
  );
});

// Customer QR-order link (`/order/<token>`) is a public page with no auth -
// checked before anything session-related so a customer never sees/needs a
// login screen. Matched on the raw path, not a router, since the rest of
// the app is a single tab-state SPA with no other routes.
const orderTokenMatch = window.location.pathname.match(/^\/order\/([^/]+)$/);

export default function App() {
  if (orderTokenMatch) return <CustomerOrderPage token={orderTokenMatch[1]} />;
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadProfile(user) {
      if (!user) {
        if (active) setProfile(null);
        return;
      }
      const p = await getProfile(user.id).catch(() => null);
      if (active) setProfile(p);
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user).finally(() => active && setAuthLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile(newSession?.user);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  if (authLoading) return <FullPageLoading />;
  if (!session) return <LoginScreen restaurantName="Restro Hisaab" />;
  if (!profile || !profile.active) return <NoAccessScreen onLogout={signOut} />;
  return (
    <SubscriptionGate profile={profile}>
      {profile.role === 'captain' ? <CaptainShell profile={profile} /> : profile.role === 'inventory' ? <InventoryShell profile={profile} /> : <ManagerShell profile={profile} />}
    </SubscriptionGate>
  );
}

// Yearly license gate. Nobody in the app can change the `subscription` row
// (see the RLS policy in supabase-schema.sql) - only the developer, via the
// Supabase Dashboard, after confirming payment. Blocks every role once
// expired; Super Admin sees payment details so the owner can act, Admin/
// Captain just see a generic "contact the owner" message.
function SubscriptionGate({ profile, children }) {
  const [sub, setSub] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.from('subscription').select('*').eq('id', 'main').maybeSingle().then(({ data }) => setSub(data || null));
  }, []);

  if (sub === undefined) return <FullPageLoading />;
  if (!sub) return children; // no subscription row configured yet - don't lock anyone out

  // Demo mode: no real purchase/expiry confirmed yet, so never block access
  // and skip the countdown - just a quiet badge so Super Admin remembers
  // this isn't the live paid state.
  if (sub.is_demo) {
    return (
      <>
        {profile.role === 'super_admin' && (
          <div className="bg-pending/15 text-pending text-xs font-semibold text-center py-1.5 px-3">
            DEMO APP
          </div>
        )}
        {children}
      </>
    );
  }

  const daysLeft = Math.ceil((new Date(sub.renews_at) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
  const expired = sub.status === 'expired' || daysLeft < 0;
  const developerName = sub.upi_payee_name || 'Suraj Jawrani';

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-center">
        <div className="max-w-sm">
          <p className="text-ink font-bold text-lg mb-2">Subscription expire ho gaya hai</p>
          {profile.role === 'super_admin' ? (
            <>
              <p className="text-muted text-sm mb-4">App suspend hai. Renew karne ke liye {sub.amount ? `₹${sub.amount}` : 'yearly amount'} <b>{developerName}</b> ko bhejein — payment ke baad unhe batayein, wo turant activate kar denge.</p>
            </>
          ) : (
            <p className="text-muted text-sm mb-4">App suspend hai. Restaurant owner (Super Admin) se contact karein.</p>
          )}
          <button onClick={signOut} className="px-4 py-2 rounded-lg font-semibold text-sm bg-bg border border-border">Logout</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {profile.role === 'super_admin' && daysLeft <= 7 && (
        <div className="bg-pending/15 text-pending text-xs font-semibold text-center py-1.5 px-3">
          Subscription {daysLeft === 0 ? 'aaj' : `${daysLeft} din mein`} renew hona hai
          {sub.amount && <> — ₹{sub.amount} <b>{developerName}</b> ko bhejein</>}
        </div>
      )}
      {children}
    </>
  );
}

function NoAccessScreen({ onLogout }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-center">
      <div>
        <p className="text-ink font-bold mb-2">Aapka account abhi active nahi hai.</p>
        <p className="text-muted text-sm mb-4">Admin/Super Admin se contact karein.</p>
        <button onClick={onLogout} className="px-4 py-2 rounded-lg font-semibold text-sm bg-bg border border-border">Logout</button>
      </div>
    </div>
  );
}

// Captain: one focused screen, no sidebar, no other tabs - just the
// order-taking/KOT/bill-print flow (BillingTab in `restricted` mode).
function AppFooter() {
  return (
    <p className="text-center text-[11px] text-muted mt-8 pb-2">
      © {new Date().getFullYear()} Suraj Jawrani · Surajjawrani2011@gmail.com
    </p>
  );
}

function CaptainShell({ profile }) {
  const [name, setName] = useState('My Restaurant');
  const [details, setDetails] = useState({ address: '', phone: '', gstNumber: '', fssai: '', googleReviewLink: '' });

  useEffect(() => {
    getSetting('rm_name', 'My Restaurant').then(setName);
    getSetting('rm_details', { address: '', phone: '', gstNumber: '', fssai: '', googleReviewLink: '' }).then(setDetails);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center gap-2.5 px-4 py-3 bg-surface border-b border-border">
        <span className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-extrabold text-sm shrink-0">
          {(profile.name || 'C')[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block font-bold text-sm text-ink truncate">{profile.name}</span>
          <span className="text-[0.68rem] text-muted">Captain</span>
        </div>
        <button onClick={signOut} className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg border border-border shrink-0" aria-label="Logout" title="Logout">
          <Icon name="logout" className="w-4 h-4" />
        </button>
      </header>
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-5">
        <Suspense fallback={<TabFallback />}>
          <BillingTab restaurantName={name} restaurantDetails={details} profile={profile} restricted />
        </Suspense>
        <AppFooter />
      </main>
    </div>
  );
}

// Inventory: a dedicated login (created by Admin/Super Admin) that only
// ever sees the Inventory screen - same single-purpose shell pattern as
// Captain's. `restricted` hides the "Edit" action on items (name/unit/
// cost/min stay Admin/Super Admin only); Add/Log In-Out/Remove all work.
function InventoryShell({ profile }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center gap-2.5 px-4 py-3 bg-surface border-b border-border">
        <span className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-extrabold text-sm shrink-0">
          {(profile.name || 'I')[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block font-bold text-sm text-ink truncate">{profile.name}</span>
          <span className="text-[0.68rem] text-muted">Inventory</span>
        </div>
        <button onClick={signOut} className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg border border-border shrink-0" aria-label="Logout" title="Logout">
          <Icon name="logout" className="w-4 h-4" />
        </button>
      </header>
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-5">
        <Suspense fallback={<TabFallback />}>
          <InventoryTab restricted profile={profile} />
        </Suspense>
        <AppFooter />
      </main>
    </div>
  );
}

// Admin / Super Admin: the full sidebar shell. Super Admin always sees
// every tab; Admin's tab list is whatever Super Admin granted via
// role_permissions (PermissionsTab writes it, this just reads it).
function ManagerShell({ profile }) {
  const isSuperAdmin = profile.role === 'super_admin';
  const [activeTab, setActiveTab] = useState(null);
  const [name, setName] = useState('My Restaurant');
  const [navOpen, setNavOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);
  const fileInputRef = useRef(null);
  const [kotTickets] = useSupabaseTable('kot_tickets', []);
  const activeKotCount = useMemo(() => kotTickets.filter((k) => k.status === 'active').length, [kotTickets]);
  const [details, setDetails] = useState({ address: '', phone: '', gstNumber: '', fssai: '', googleReviewLink: '' });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef(null);
  const [rolePermissions] = useSupabaseTable('role_permissions', []);

  const adminGrants = useMemo(
    () => new Map(rolePermissions.filter((r) => r.role === 'admin').map((r) => [r.resource, r.canWrite])),
    [rolePermissions]
  );

  const tabs = useMemo(() => {
    if (isSuperAdmin) return [...TABS, KOT_HISTORY_TAB, USERS_TAB, PERMISSIONS_TAB, PRINTER_SETTINGS_TAB, PRINT_HISTORY_TAB];
    return [...TABS.filter((t) => adminGrants.has(t.id)), KOT_HISTORY_TAB, USERS_TAB, CAPTAIN_PERMISSIONS_TAB, PRINTER_SETTINGS_TAB, PRINT_HISTORY_TAB];
  }, [isSuperAdmin, adminGrants]);

  useEffect(() => {
    if (activeTab === null && tabs.length) setActiveTab(tabs[0].id);
    else if (activeTab !== null && tabs.length && !tabs.find((t) => t.id === activeTab)) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  useEffect(() => {
    getSetting('rm_name', 'My Restaurant').then(setName);
    getSetting('rm_details', { address: '', phone: '', gstNumber: '', fssai: '', googleReviewLink: '' }).then(setDetails);
    getSetting('rm_logo_url', null).then(setLogoUrl);
  }, []);

  const handleLogoFile = useCallback(async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setLogoUploading(true);
    try {
      const url = await uploadLogo(file);
      setLogoUrl(url);
      await setSetting('rm_logo_url', url);
    } catch (err) {
      alert('Logo upload nahi ho paya: ' + err.message);
    }
    setLogoUploading(false);
  }, []);

  const removeLogo = useCallback(() => {
    setLogoUrl(null);
    setSetting('rm_logo_url', null);
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

  const saveDetails = useCallback((e) => {
    e.preventDefault();
    const f = e.target;
    const next = {
      address: f.address.value.trim(), phone: f.phone.value.trim(), gstNumber: f.gstNumber.value.trim(),
      fssai: f.fssai.value.trim(), googleReviewLink: f.googleReviewLink.value.trim()
    };
    setDetails(next);
    setSetting('rm_details', next);
    setDetailsOpen(false);
  }, []);

  // Export/Backup/Restore/Restaurant Details are occasional admin actions,
  // not things staff reach for during service - collapsing them behind one
  // "Settings & Data" button (instead of 4 always-visible sidebar buttons
  // that looked like nav items) keeps the sidebar focused on what's used
  // constantly. The profile row stays separate and visually distinct so
  // "who am I logged in as" / "log out" reads as account state, not a menu.
  const utilityButtons = (
    <>
      <button onClick={() => setSettingsOpen(true)} className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink flex items-center gap-1.5">
        <Icon name="permissions" className="w-3.5 h-3.5" /> Settings & Data
      </button>
      <div className="flex items-center gap-2 pt-1.5 mt-0.5 border-t border-border">
        <span className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center font-extrabold text-xs shrink-0">
          {(profile.name || 'U')[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block font-semibold text-xs text-ink truncate">{profile.name}</span>
          <span className="block text-[0.65rem] text-muted capitalize">{profile.role?.replace('_', ' ')}</span>
        </div>
        <button onClick={signOut} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-bg shrink-0" aria-label="Logout" title="Logout">
          <Icon name="logout" className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>
    </>
  );

  const readOnly = !isSuperAdmin && activeTab !== 'users' && adminGrants.get(activeTab) === false;

  return (
    <div className="flex min-h-screen">
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleRestoreFile} />

      {/* Desktop persistent sidebar */}
      <aside className="hidden sm:flex sm:flex-col w-56 shrink-0 bg-surface border-r border-border h-screen sticky top-0">
        <SidebarNav name={name} onNameChange={handleNameChange} logoUrl={logoUrl} activeTab={activeTab} onNavigate={selectTab} utilityButtons={utilityButtons} tabs={tabs} />
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
            <SidebarNav name={name} onNameChange={handleNameChange} logoUrl={logoUrl} activeTab={activeTab} onNavigate={selectTab} utilityButtons={utilityButtons} tabs={tabs} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="sm:hidden flex items-center gap-2.5 px-4 py-3 bg-surface border-b border-border">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-border" />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-extrabold text-sm shrink-0">
              {(name || 'R')[0].toUpperCase()}
            </span>
          )}
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
          {readOnly && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-pending/15 text-pending text-xs font-semibold">
              View only — Super Admin ne is tab par edit access nahi diya hai.
            </div>
          )}
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'billing' && <BillingTab restaurantName={name} restaurantDetails={details} profile={profile} />}
            {activeTab === 'kitchen' && <KitchenDisplayTab />}
            {activeTab === 'reservations' && <ReservationsTab restaurantName={name} restaurantDetails={details} />}
            {activeTab === 'dashboard' && <DashboardTab restaurantName={name} restaurantDetails={details} />}
            {activeTab === 'reports' && <ReportsTab restaurantName={name} restaurantDetails={details} profile={profile} />}
            {activeTab === 'audit' && <CashAuditTab />}
            {activeTab === 'inventory' && <InventoryTab profile={profile} />}
            {activeTab === 'expenses' && <ExpensesTab />}
            {activeTab === 'staff' && <StaffTab />}
            {activeTab === 'vendors' && <VendorsTab />}
            {activeTab === 'customers' && <CustomersTab restaurantName={name} />}
            {activeTab === 'menu' && <MenuTab />}
            {activeTab === 'kot_history' && <KotHistoryTab profile={profile} />}
            {activeTab === 'users' && <UserManagementTab viewerRole={profile.role} />}
            {activeTab === 'permissions' && isSuperAdmin && <PermissionsTab role="admin" />}
            {activeTab === 'captain_permissions' && !isSuperAdmin && <PermissionsTab role="captain" />}
            {activeTab === 'printer_settings' && <PrinterSettingsTab />}
            {activeTab === 'print_history' && <PrintHistoryTab />}
          </Suspense>
          <AppFooter />
        </main>

        {/* Mobile bottom tab bar - the 5 destinations used constantly during
            service; everything else lives behind the "More" drawer above. */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border flex items-stretch shadow-panel">
          {MOBILE_PRIMARY_TABS.filter((id) => tabs.find((t) => t.id === id)).map((id) => {
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

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings & Data">
        <div className="flex flex-col gap-1.5">
          <button onClick={() => { setSettingsOpen(false); setDetailsOpen(true); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-left bg-bg border border-border hover:border-accent">
            <Icon name="menu" className="w-4 h-4 shrink-0 text-muted" />
            <span className="flex-1">
              Restaurant Details
              <span className="block text-xs font-normal text-muted">Address, phone, GST number — bill print pe dikhega</span>
            </span>
          </button>
          <button onClick={() => { setSettingsOpen(false); downloadExcel(); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-left bg-bg border border-border hover:border-accent">
            <Icon name="reports" className="w-4 h-4 shrink-0 text-muted" />
            <span className="flex-1">
              Export Excel
              <span className="block text-xs font-normal text-muted">Bills, expenses, inventory, vendors, staff, customers — sab ek file mein</span>
            </span>
          </button>
          <button onClick={() => { setSettingsOpen(false); downloadBackup(); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-left bg-bg border border-border hover:border-accent">
            <Icon name="inventory" className="w-4 h-4 shrink-0 text-muted" />
            <span className="flex-1">
              Backup Data
              <span className="block text-xs font-normal text-muted">Pura data ek file mein download karein (app mein restore karne ke liye)</span>
            </span>
          </button>
          <button onClick={() => { setSettingsOpen(false); fileInputRef.current?.click(); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-left bg-bg border border-border hover:border-accent">
            <Icon name="expenses" className="w-4 h-4 shrink-0 text-muted" />
            <span className="flex-1">
              Restore Data
              <span className="block text-xs font-normal text-muted">Pehle se saved backup file se data restore karein</span>
            </span>
          </button>
        </div>
        <p className="text-center text-[11px] text-muted mt-4">
          © {new Date().getFullYear()} Suraj Jawrani · Surajjawrani2011@gmail.com
        </p>
        <ModalActions>
          <Btn onClick={() => setSettingsOpen(false)}>Close</Btn>
        </ModalActions>
      </Modal>

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Restaurant Details">
        <p className="text-muted text-xs -mt-1 mb-3">Ye bill print/download pe dikhega — GSTIN aur address customer ke liye zaroori hai.</p>
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border" />
          ) : (
            <span className="w-14 h-14 rounded-lg bg-accent text-white flex items-center justify-center font-extrabold text-lg shrink-0">
              {(name || 'R')[0].toUpperCase()}
            </span>
          )}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted font-semibold">Logo</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-bg border border-border hover:text-ink disabled:opacity-60">
                {logoUploading ? 'Upload ho raha hai...' : logoUrl ? 'Change Logo' : 'Upload Logo'}
              </button>
              {logoUrl && (
                <button type="button" onClick={removeLogo} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-bg border border-border text-bad hover:bg-bad/10">
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
        <form onSubmit={saveDetails}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Address</label>
            <input name="address" defaultValue={details.address} placeholder="e.g. 12 MG Road, Indore" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Phone number</label>
            <input name="phone" defaultValue={details.phone} placeholder="e.g. 98765 43210" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">GST Number (GSTIN)</label>
            <input name="gstNumber" defaultValue={details.gstNumber} placeholder="e.g. 23AAAAA0000A1Z5" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">FSSAI License Number (optional)</label>
            <input name="fssai" defaultValue={details.fssai} placeholder="e.g. 20523083000421" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Google Review Link (optional)</label>
            <input name="googleReviewLink" defaultValue={details.googleReviewLink} placeholder="e.g. g.page/r/..." className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Save</Btn>
            <Btn type="button" onClick={() => setDetailsOpen(false)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>

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
