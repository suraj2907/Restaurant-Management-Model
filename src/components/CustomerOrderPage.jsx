import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { uid, rupee } from '../lib/store.js';
import { VegMark } from './Icons.jsx';

// Public, unauthenticated page a customer lands on after scanning their
// table's QR code. No login, no sidebar - just menu -> cart -> place order.
// The order is never written directly to table_state/kot_tickets; it goes
// into customer_order_requests for staff to accept from BillingTab, so an
// anonymous submission can never touch a live bill on its own.
export default function CustomerOrderPage({ token }) {
  const [status, setStatus] = useState('loading'); // loading | invalid | ready | placed
  const [tableInfo, setTableInfo] = useState(null);
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({}); // menuId -> qty
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc('resolve_qr_table', { p_token: token });
      if (!active) return;
      const row = data?.[0];
      if (error || !row) { setStatus('invalid'); return; }
      setTableInfo({ tableId: row.table_id, tableName: row.table_name, restaurantName: row.restaurant_name });
      const { data: items } = await supabase.from('menu').select('*').order('category');
      if (!active) return;
      setMenu(items || []);
      setStatus('ready');
    })();
    return () => { active = false; };
  }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((m) => (!q || m.name.toLowerCase().includes(q)) && (!vegOnly || m.veg !== false));
  }, [menu, search, vegOnly]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category).push(m);
    }
    return [...map.entries()];
  }, [filtered]);

  const cartItems = useMemo(
    () => Object.entries(cart).filter(([, qty]) => qty > 0).map(([menuId, qty]) => ({ ...menu.find((m) => m.id === menuId), qty })).filter((i) => i.id),
    [cart, menu]
  );
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);

  function setQty(menuId, qty) {
    setCart((prev) => ({ ...prev, [menuId]: Math.max(0, qty) }));
  }

  async function placeOrder() {
    if (!cartItems.length || placing) return;
    const name = customerName.trim();
    const phone = customerPhone.trim();
    if (!name || !phone) { alert('Naam aur phone number dono zaruri hain.'); return; }
    setPlacing(true);
    const items = cartItems.map((i) => ({ menuId: i.id, name: i.name, price: i.price, qty: i.qty, veg: i.veg !== false, note: '', station: i.station || 'kitchen', gstIncluded: i.gstIncluded !== false }));
    const [{ error }] = await Promise.all([
      supabase.from('customer_order_requests').insert({
        id: uid(),
        table_id: tableInfo.tableId,
        table_name: tableInfo.tableName,
        items,
        customer_name: name,
        customer_phone: phone,
        note: note.trim() || null,
        status: 'pending'
      }),
      supabase.rpc('record_qr_customer', { p_name: name, p_phone: phone })
    ]);
    setPlacing(false);
    if (error) { alert('Order place nahi ho paaya, dobara try karein.'); return; }
    setStatus('placed');
  }

  function orderMore() {
    setCart({});
    setCartOpen(false);
    setStatus('ready');
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted text-sm">Loading menu...</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-center">
        <div>
          <p className="text-ink font-bold text-lg mb-2">Ye link valid nahi hai</p>
          <p className="text-muted text-sm">Staff se sampark karein ya table pe laga QR code dobara scan karein.</p>
        </div>
      </div>
    );
  }

  if (status === 'placed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-center">
        <div className="max-w-sm">
          <div className="w-14 h-14 rounded-full bg-good/15 text-good flex items-center justify-center mx-auto mb-3 text-2xl font-bold">✓</div>
          <p className="text-ink font-bold text-lg mb-1">Order mil gaya!</p>
          <p className="text-muted text-sm mb-5">Table {tableInfo.tableName} — staff jald confirm karega. Kitchen ko order abhi jaayega.</p>
          <button onClick={orderMore} className="px-4 py-2.5 rounded-lg font-semibold text-sm bg-accent text-white">Aur order karein</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-24">
      <header className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3">
        <p className="font-bold text-ink text-base">{tableInfo.restaurantName}</p>
        <p className="text-xs text-muted">Table {tableInfo.tableName} — apna order yahin se daalein</p>
      </header>

      <div className="px-4 pt-3 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Item search karein..."
          className="flex-1 px-3 py-2.5 border border-border rounded-lg text-sm bg-surface"
        />
        <button
          onClick={() => setVegOnly((v) => !v)}
          className={`px-3 py-2.5 rounded-lg text-xs font-semibold border shrink-0 ${vegOnly ? 'bg-good text-white border-good' : 'bg-surface border-border text-muted'}`}
        >
          Veg only
        </button>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-4">
        {grouped.length === 0 && <p className="text-muted text-sm text-center py-8">Koi item nahi mila.</p>}
        {grouped.map(([category, items]) => (
          <div key={category}>
            <p className="text-xs font-bold uppercase text-muted tracking-wide mb-2">{category}</p>
            <div className="flex flex-col gap-2">
              {items.map((m) => {
                const qty = cart[m.id] || 0;
                return (
                  <div key={m.id} className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3">
                    <VegMark veg={m.veg !== false} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-ink truncate">{m.name}</p>
                      <p className="text-accent-dark font-bold text-sm">{rupee(m.price)}</p>
                    </div>
                    {qty === 0 ? (
                      <button onClick={() => setQty(m.id, 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-white shrink-0">Add</button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setQty(m.id, qty - 1)} className="w-7 h-7 rounded-lg border border-border font-bold text-sm">−</button>
                        <span className="w-5 text-center font-semibold text-sm">{qty}</span>
                        <button onClick={() => setQty(m.id, qty + 1)} className="w-7 h-7 rounded-lg border border-border font-bold text-sm">+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 max-w-md mx-auto bg-accent text-white rounded-xl px-4 py-3.5 flex items-center justify-between font-semibold text-sm shadow-modal"
        >
          <span>{cartCount} item{cartCount > 1 ? 's' : ''} — {rupee(cartTotal)}</span>
          <span>Cart dekhein →</span>
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-20 flex items-end sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setCartOpen(false)} />
          <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-4">
            <p className="font-bold text-ink mb-3">Aapka Order</p>
            <div className="flex flex-col gap-2 mb-4">
              {cartItems.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <VegMark veg={i.veg !== false} />
                  <span className="flex-1">{i.name}</span>
                  <button onClick={() => setQty(i.id, i.qty - 1)} className="w-6 h-6 rounded border border-border font-bold text-xs">−</button>
                  <span className="w-5 text-center font-semibold">{i.qty}</span>
                  <button onClick={() => setQty(i.id, i.qty + 1)} className="w-6 h-6 rounded border border-border font-bold text-xs">+</button>
                  <span className="w-16 text-right font-semibold">{rupee(i.price * i.qty)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between font-bold text-ink mb-4 pt-2 border-t border-border">
              <span>Total</span>
              <span>{rupee(cartTotal)}</span>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <div>
                <label className="text-xs font-semibold text-muted">Aapka naam <span className="text-bad">*</span></label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required placeholder="e.g. Rohit Sharma" className="w-full px-3 py-2 border border-border rounded-lg text-sm mt-0.5" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted">Phone number <span className="text-bad">*</span></label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} required type="tel" placeholder="e.g. 98765 43210" className="w-full px-3 py-2 border border-border rounded-lg text-sm mt-0.5" />
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kuch note karna hai? (optional)" className="px-3 py-2 border border-border rounded-lg text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCartOpen(false)} className="px-4 py-2.5 rounded-lg font-semibold text-sm bg-bg border border-border flex-1">Menu pe wapas</button>
              <button onClick={placeOrder} disabled={placing || !customerName.trim() || !customerPhone.trim()} className="px-4 py-2.5 rounded-lg font-semibold text-sm bg-accent text-white flex-1 disabled:opacity-60">
                {placing ? 'Bhej rahe hain...' : 'Order Place Karein'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
