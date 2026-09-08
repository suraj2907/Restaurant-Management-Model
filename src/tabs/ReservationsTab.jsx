import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSupabaseTable } from '../lib/useSupabaseTable.js';
import { uid, rupee, todayStr } from '../lib/store.js';
import { downloadPartyQuote, partyQuoteWhatsappLink } from '../lib/quotePdf.js';
import { SkeletonCards } from '../components/Skeleton.jsx';
import Modal, { ModalActions, Btn } from '../components/Modal.jsx';

const STATUS_STYLE = {
  upcoming: 'bg-accent/10 text-accent-dark',
  waitlist: 'bg-secondary/15 text-secondary-dark',
  seated: 'bg-good/15 text-good',
  completed: 'bg-border/60 text-muted',
  cancelled: 'bg-bad/10 text-bad'
};

export default function ReservationsTab({ restaurantName, restaurantDetails }) {
  const [reservations, setReservations, loaded] = useSupabaseTable('reservations', []);
  const [tableRows] = useSupabaseTable('restaurant_tables', []);
  const tables = useMemo(() => tableRows.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((t) => t.name), [tableRows]);
  const [menu] = useSupabaseTable('menu', []);
  const [tableStates, setTableStates] = useSupabaseTable('table_state', []);
  const [menuPackages, setMenuPackages] = useSupabaseTable('menu_packages', []);
  const [filter, setFilter] = useState('upcoming');
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [packageFor, setPackageFor] = useState(null); // reservation being edited in the package modal
  const [pkgSearch, setPkgSearch] = useState('');
  const [selectedPkgItems, setSelectedPkgItems] = useState([]); // menuIds - tracked in state (not the DOM) so a selection survives the search box filtering it out of view
  const [pkgName, setPkgName] = useState(''); // e.g. "Gold Plate" - controlled so picking a saved plate can pre-fill it
  const [pkgPrice, setPkgPrice] = useState('');
  const [saveAsPlate, setSaveAsPlate] = useState(true);
  const [billingFor, setBillingFor] = useState(null); // reservation being sent to Billing

  function openPackage(r) {
    setPackageFor(r);
    setPkgSearch('');
    setSelectedPkgItems((r.packageItems || []).map((i) => i.menuId));
    setPkgName(r.packageName || '');
    setPkgPrice(r.pricePerPlate || '');
    setSaveAsPlate(true);
  }

  function togglePkgItem(menuId, checked) {
    setSelectedPkgItems((prev) => (checked ? [...prev, menuId] : prev.filter((id) => id !== menuId)));
  }

  // Picking a previously-saved plate (Gold/Platinum/...) pre-fills name,
  // price and items - still freely editable for this specific booking
  // without changing the saved master plate (unless "save" stays checked).
  function pickSavedPackage(pkgId) {
    const pkg = menuPackages.find((p) => p.id === pkgId);
    if (!pkg) return;
    setPkgName(pkg.name);
    setPkgPrice(pkg.pricePerPlate);
    setSelectedPkgItems((pkg.items || []).map((i) => i.menuId));
  }

  // Every booking's name/phone lands in the Customers CRM too, not just
  // paid bills - same SECURITY DEFINER RPC every other entry point uses
  // (captain opening a table, QR order), so it works regardless of
  // whether this role has been granted the `customers` resource, and
  // never overwrites an existing customer's stats.
  function ensureCustomer(name, phone) {
    const clean = (phone || '').trim();
    if (!clean) return;
    supabase.rpc('register_customer', { p_name: name, p_phone: clean });
  }

  function addReservation(e) {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    setReservations([
      ...reservations,
      {
        id: uid(),
        name, phone,
        date: f.date.value,
        time: f.time.value,
        partySize: parseInt(f.partySize.value, 10) || 1,
        table: f.table.value,
        note: f.note.value.trim(),
        advanceAmount: parseFloat(f.advanceAmount.value) || 0,
        status: 'upcoming',
        createdAt: Date.now()
      }
    ]);
    ensureCustomer(name, phone);
    f.reset();
    f.date.value = todayStr();
  }

  function addWaitlist(e) {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    setReservations([
      ...reservations,
      {
        id: uid(),
        name, phone,
        date: todayStr(),
        time: new Date().toTimeString().slice(0, 5),
        partySize: parseInt(f.partySize.value, 10) || 1,
        table: '',
        note: f.note.value.trim(),
        advanceAmount: 0,
        status: 'waitlist',
        createdAt: Date.now()
      }
    ]);
    ensureCustomer(name, phone);
    setWaitlistOpen(false);
  }

  function savePackage(e) {
    e.preventDefault();
    const f = e.target;
    const name = pkgName.trim() || 'Party Package';
    const pricePerPlate = parseFloat(pkgPrice) || 0;
    const packageItems = menu.filter((m) => selectedPkgItems.includes(m.id)).map((m) => ({ menuId: m.id, name: m.name }));
    const plateCount = parseInt(f.plateCount.value, 10) || 0;

    setReservations(reservations.map((r) => (r.id === packageFor.id ? { ...r, packageName: name, packageItems, pricePerPlate, plateCount } : r)));

    if (saveAsPlate) {
      // Upsert into the reusable plate list, matched by name, so the next
      // booking can just pick "Gold Plate" again instead of rebuilding it.
      const existingPlate = menuPackages.find((p) => p.name.toLowerCase() === name.toLowerCase());
      const plateRow = { id: existingPlate?.id || uid(), name, pricePerPlate, items: packageItems };
      setMenuPackages(existingPlate ? menuPackages.map((p) => (p.id === plateRow.id ? plateRow : p)) : [...menuPackages, plateRow]);
    }

    setPackageFor(null);
  }

  // Puts the plate on the table as a single billable line - the plate's
  // NAME x final plate count x its per-plate rate - never the individual
  // items. That's how real banquet/catering billing works: the customer's
  // bill just says "Gold Plate x120", not every dish in it (the items are
  // for the quote only, so the customer knows what they're paying for).
  // Anything ordered beyond the package (extra drinks etc.) gets added
  // normally from Billing afterwards.
  function confirmStartBilling(e) {
    e.preventDefault();
    const f = e.target;
    const tableName = f.table.value;
    const finalPlateCount = parseInt(f.finalPlateCount.value, 10) || 0;
    if (!tableName || finalPlateCount <= 0) return;

    const packageLine = {
      menuId: `pkg-${billingFor.id}`,
      name: billingFor.packageName || 'Party Package',
      price: billingFor.pricePerPlate,
      qty: finalPlateCount,
      veg: true,
      note: '',
      station: 'kitchen'
    };
    const existing = tableStates.find((ts) => ts.id === tableName);
    const nextRow = {
      id: tableName, tableName,
      items: existing ? [...existing.items, packageLine] : [packageLine],
      kotSent: existing?.kotSent || {},
      stewardId: existing?.stewardId || null,
      guestCount: finalPlateCount,
      guestName: billingFor.name,
      customerName: billingFor.name,
      customerPhone: billingFor.phone,
      discount: existing?.discount || 0,
      startedAt: existing?.startedAt || Date.now()
    };
    setTableStates(existing ? tableStates.map((ts) => (ts.id === tableName ? nextRow : ts)) : [...tableStates, nextRow]);
    setReservations(reservations.map((x) => (x.id === billingFor.id ? { ...x, table: tableName, status: 'seated', plateCount: finalPlateCount } : x)));
    setBillingFor(null);
  }

  function setStatus(id, status) {
    setReservations(reservations.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  const waitlistCount = useMemo(() => reservations.filter((r) => r.status === 'waitlist').length, [reservations]);

  const filtered = useMemo(() => {
    const sorted = reservations.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const today = todayStr();
    return sorted.filter((r) => {
      if (filter === 'today') return r.date === today;
      if (filter === 'upcoming') return r.status === 'upcoming';
      if (filter === 'waitlist') return r.status === 'waitlist';
      return true;
    });
  }, [reservations, filter]);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3.5">
        <h2 className="text-lg font-bold m-0">Table Reservations &amp; Waitlist</h2>
        <button
          onClick={() => setWaitlistOpen(true)}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-secondary text-white hover:bg-secondary-dark"
        >
          + Add to Waitlist
        </button>
      </div>
      <form onSubmit={addReservation} className="flex gap-2.5 flex-wrap mb-4 bg-surface border border-border p-3.5 rounded-lg">
        <input name="name" required placeholder="Customer name" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="phone" required placeholder="Phone" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="date" type="date" defaultValue={todayStr()} required className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="time" type="time" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <input name="partySize" type="number" min="1" defaultValue="2" placeholder="Guests" className="px-2.5 py-2 border border-border rounded-md text-sm w-24" />
        <select name="table" defaultValue="" className="px-2.5 py-2 border border-border rounded-md text-sm">
          <option value="">Koi bhi table</option>
          {tables.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input name="advanceAmount" type="number" step="0.01" placeholder="Advance/token (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm w-44" />
        <input name="note" placeholder="Note (optional)" className="px-2.5 py-2 border border-border rounded-md text-sm" />
        <button className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark">Add Reservation</button>
      </form>

      <div className="flex gap-1.5 mb-3.5 flex-wrap">
        {[
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'waitlist', label: `Waitlist${waitlistCount ? ` (${waitlistCount})` : ''}` },
          { id: 'today', label: 'Today' },
          { id: 'all', label: 'All' }
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold border ${filter === f.id ? 'bg-accent text-white border-accent' : 'bg-surface border-border'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {!loaded && <SkeletonCards count={4} />}
        {loaded && filtered.length === 0 && <p className="text-muted text-sm col-span-full">Koi reservation nahi hai.</p>}
        {loaded && filtered.map((r) => (
          <div key={r.id} className={`bg-surface border rounded-xl p-3.5 shadow-card flex flex-col gap-2.5 ${r.status === 'waitlist' ? 'border-secondary' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-bold text-sm block">{r.name}</span>
                <span className="text-xs text-muted">{r.phone}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold uppercase capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-well/60 rounded-lg p-2 text-center">
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Date/Time</span>
                <span className="font-bold text-xs">{r.date === todayStr() ? 'Today' : r.date} {r.time}</span>
              </div>
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Guests</span>
                <span className="font-bold text-sm">{r.partySize}</span>
              </div>
              <div>
                <span className="block text-[0.6rem] text-muted uppercase">Table</span>
                <span className="font-bold text-sm">{r.table || 'Any'}</span>
              </div>
            </div>

            {r.advanceAmount > 0 && (
              <div className="bg-secondary/10 border border-secondary/30 rounded-lg p-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-secondary-dark">Advance Token</span>
                <span className="font-bold text-secondary-dark">{rupee(r.advanceAmount)}</span>
              </div>
            )}
            {r.note && <p className="text-xs text-muted italic bg-bg rounded-lg p-2">"{r.note}"</p>}

            {r.pricePerPlate > 0 && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-accent-dark">{r.packageName || 'Party Package'}</span>
                  <span className="text-xs text-accent-dark">{rupee(r.pricePerPlate)}/plate</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">{r.plateCount ? `${r.plateCount} plates` : 'Plates bill ke waqt confirm honge'}</span>
                  {r.plateCount ? <span className="font-bold text-accent-dark">{rupee(r.plateCount * r.pricePerPlate)}</span> : null}
                </div>
                {(r.packageItems || []).length > 0 && (
                  <span className="text-[0.65rem] text-muted">Includes: {r.packageItems.map((i) => i.name).join(', ')} <i>(sirf quote ke liye, bill pe nahi dikhega)</i></span>
                )}
              </div>
            )}

            <div className="flex gap-1.5 flex-wrap">
              <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => openPackage(r)}>
                {r.pricePerPlate > 0 ? 'Edit Package' : 'Party Package'}
              </button>
              {r.pricePerPlate > 0 && (
                <>
                  <button
                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border"
                    onClick={() => downloadPartyQuote(r, restaurantName, restaurantDetails)}
                  >
                    Download Quote (PDF)
                  </button>
                  <a
                    href={partyQuoteWhatsappLink(r)}
                    target="_blank" rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-good text-white text-center"
                  >
                    Share on WhatsApp
                  </a>
                  {(r.status === 'upcoming' || r.status === 'waitlist') && (
                    <button
                      className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-accent text-white"
                      onClick={() => setBillingFor(r)}
                    >
                      Start Billing →
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {(r.status === 'upcoming' || r.status === 'waitlist') && (
                <>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setReservations(reservations.map((x) => (x.id === r.id ? { ...x, table: e.target.value, status: 'seated' } : x)));
                    }}
                    className="flex-1 min-w-[100px] px-2 py-1.5 rounded-md text-xs font-semibold bg-good text-white border-0"
                  >
                    <option value="">Seat at...</option>
                    {tables.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setStatus(r.id, 'cancelled')}>Cancel</button>
                </>
              )}
              {r.status === 'seated' && (
                <button className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border" onClick={() => setStatus(r.id, 'completed')}>Mark Completed</button>
              )}
              <button className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-bad border border-bad/30 hover:bg-bad/5" onClick={() => setReservations(reservations.filter((x) => x.id !== r.id))}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={waitlistOpen} onClose={() => setWaitlistOpen(false)} title="Add to Waitlist">
        <p className="text-muted text-xs -mt-1 mb-3">Walk-in guest jinke liye abhi table available nahi hai — table free hote hi "Seat at" se assign kar dena.</p>
        <form onSubmit={addWaitlist}>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Guest name</label>
            <input name="name" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Phone</label>
            <input name="phone" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Guests</label>
            <input name="partySize" type="number" min="1" defaultValue="2" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <div className="flex flex-col gap-1 mb-3">
            <label className="text-xs text-muted font-semibold">Note</label>
            <input name="note" placeholder="e.g. Waiting near entrance" className="px-2.5 py-2 border border-border rounded-md text-sm" />
          </div>
          <ModalActions>
            <Btn variant="primary" type="submit">Add to Waitlist</Btn>
            <Btn type="button" onClick={() => setWaitlistOpen(false)}>Cancel</Btn>
          </ModalActions>
        </form>
      </Modal>

      <Modal open={!!packageFor} onClose={() => setPackageFor(null)} title={packageFor ? `Party Package — ${packageFor.name}` : ''}>
        <p className="text-muted text-xs -mt-1 mb-3">Per-plate price set karein aur menu mein se kya-kya include hai wo tick kar dein — quote PDF/WhatsApp mein yehi dikhega.</p>
        {packageFor && (
          <form onSubmit={savePackage}>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted font-semibold">Plate name (e.g. Gold Plate)</label>
                <input value={pkgName} onChange={(e) => setPkgName(e.target.value)} required placeholder="Gold Plate" className="px-2.5 py-2 border border-border rounded-md text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted font-semibold">Price per plate (₹)</label>
                <input value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} type="number" step="0.01" min="0" required className="px-2.5 py-2 border border-border rounded-md text-sm" />
              </div>
            </div>

            {menuPackages.length > 0 && (
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-xs text-muted font-semibold">Ya pehle se saved plate use karein</label>
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) pickSavedPackage(e.target.value); }}
                  className="px-2.5 py-2 border border-border rounded-md text-sm"
                >
                  <option value="">-- Choose a saved plate --</option>
                  {menuPackages.map((p) => <option key={p.id} value={p.id}>{p.name} ({rupee(p.pricePerPlate)}/plate)</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Number of plates (optional)</label>
              <input name="plateCount" type="number" min="1" defaultValue={packageFor.plateCount || ''} placeholder="Bill ke waqt confirm karenge" className="px-2.5 py-2 border border-border rounded-md text-sm w-full" />
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted font-semibold">Is plate mein kya include hai (quote ke liye, optional)</label>
              {selectedPkgItems.length > 0 && <span className="text-[0.65rem] text-accent-dark font-semibold">{selectedPkgItems.length} selected</span>}
            </div>
            <input
              value={pkgSearch}
              onChange={(e) => setPkgSearch(e.target.value)}
              placeholder="Item search karein..."
              className="w-full px-2.5 py-2 border border-border rounded-md text-sm mb-2"
            />
            <div className="max-h-[220px] overflow-y-auto border border-border rounded-lg p-2 mb-3 flex flex-col gap-1">
              {menu.length === 0 && <p className="text-muted text-xs">Pehle Menu Setup tab mein items add karein.</p>}
              {menu.length > 0 && menu.filter((m) => m.name.toLowerCase().includes(pkgSearch.toLowerCase())).length === 0 && (
                <p className="text-muted text-xs">Koi item nahi mila.</p>
              )}
              {menu.filter((m) => m.name.toLowerCase().includes(pkgSearch.toLowerCase())).map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedPkgItems.includes(m.id)}
                    onChange={(e) => togglePkgItem(m.id, e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  {m.name}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted mb-3">
              <input type="checkbox" checked={saveAsPlate} onChange={(e) => setSaveAsPlate(e.target.checked)} className="w-3.5 h-3.5 accent-accent" />
              Is plate ko save karein — agli baar seedhe dropdown se select kar sakenge
            </label>
            <ModalActions>
              <Btn variant="primary" type="submit">Save Package</Btn>
              <Btn type="button" onClick={() => setPackageFor(null)}>Cancel</Btn>
            </ModalActions>
          </form>
        )}
      </Modal>

      <Modal open={!!billingFor} onClose={() => setBillingFor(null)} title={billingFor ? `Start Billing — ${billingFor.name}` : ''}>
        <p className="text-muted text-xs -mt-1 mb-3">Table choose karein aur aaj ki final plate ginti confirm karein — Billing tab mein "{billingFor?.packageName}" ek hi line ke roop mein already add hoga (items nahi dikhenge), uske baad extra items (drinks waghera) wahan se add kar sakte hain.</p>
        {billingFor && (
          <form onSubmit={confirmStartBilling}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Table</label>
              <select name="table" required defaultValue="" className="px-2.5 py-2 border border-border rounded-md text-sm">
                <option value="" disabled>Table choose karein</option>
                {tables.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs text-muted font-semibold">Final plate count</label>
              <input name="finalPlateCount" type="number" min="1" required defaultValue={billingFor.plateCount || ''} placeholder="e.g. 42" className="px-2.5 py-2 border border-border rounded-md text-sm" />
            </div>
            <div className="bg-well/60 rounded-lg p-2.5 text-sm mb-3 flex items-center justify-between">
              <span className="font-bold">{billingFor.packageName}</span>
              <span className="text-muted">@ {rupee(billingFor.pricePerPlate)}/plate</span>
            </div>
            <ModalActions>
              <Btn variant="primary" type="submit">Start Billing</Btn>
              <Btn type="button" onClick={() => setBillingFor(null)}>Cancel</Btn>
            </ModalActions>
          </form>
        )}
      </Modal>
    </section>
  );
}
