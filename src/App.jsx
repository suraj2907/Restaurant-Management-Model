import { useEffect, useState } from 'react';
import { store } from './lib/store.js';
import BillingTab from './tabs/BillingTab.jsx';
import DashboardTab from './tabs/DashboardTab.jsx';
import ReportsTab from './tabs/ReportsTab.jsx';
import InventoryTab from './tabs/InventoryTab.jsx';
import ExpensesTab from './tabs/ExpensesTab.jsx';
import StaffTab from './tabs/StaffTab.jsx';
import CustomersTab from './tabs/CustomersTab.jsx';
import MenuTab from './tabs/MenuTab.jsx';

const TABS = [
  { id: 'billing', label: 'Billing' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'reports', label: 'Reports' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'staff', label: 'Staff' },
  { id: 'customers', label: 'Customers' },
  { id: 'menu', label: 'Menu Setup' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('billing');
  const [name, setName] = useState(() => store.get('rm_name', 'My Restaurant'));

  useEffect(() => {
    store.set('rm_name', name);
    document.title = `${name} — Manager`;
  }, [name]);

  return (
    <div>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-surface border-b border-border flex-wrap">
        <input
          className="text-lg sm:text-xl font-bold text-accent-dark bg-transparent px-1.5 py-1 rounded-md max-w-[60vw] sm:max-w-none focus:outline focus:outline-2 focus:outline-accent focus:bg-bg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
        <nav className="flex gap-1.5 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold border ${
                activeTab === t.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg text-muted border-border hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 pb-14">
        {activeTab === 'billing' && <BillingTab restaurantName={name} />}
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'staff' && <StaffTab />}
        {activeTab === 'customers' && <CustomersTab />}
        {activeTab === 'menu' && <MenuTab />}
      </main>
    </div>
  );
}
