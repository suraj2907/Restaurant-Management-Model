import { useState } from 'react';
import { verifyAdminReprintPassword } from '../lib/reprintAuth.js';

// Inline (never a browser prompt/new window/separate page) admin-password
// check that gates every KOT/bill reprint. Renders as a compact row meant
// to sit inside the same card as the "Reprint" button that opened it.
export default function ReprintAuthorization({ open, title, onCancel, onAuthorized }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function cancel() {
    setPassword('');
    setError('');
    setBusy(false);
    onCancel();
  }

  async function verify() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const ok = await verifyAdminReprintPassword(password);
      if (!ok) {
        setError('Invalid admin password.');
        setBusy(false);
        return;
      }
      setPassword('');
      setBusy(false);
      onAuthorized();
    } catch (err) {
      setError(err.message || 'Verification failed.');
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); verify(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }

  return (
    <div className="flex flex-col gap-1.5 bg-bad/5 border border-bad/30 rounded-lg p-2.5 mt-2">
      {title && <span className="text-xs font-semibold text-ink">{title}</span>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <label className="text-xs text-muted shrink-0">Admin password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          disabled={busy}
          className="px-2 py-1.5 border border-border rounded-md text-sm w-32 disabled:opacity-60"
        />
        <button
          onClick={verify}
          disabled={busy || !password}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bad text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Verifying...' : 'Verify & Reprint'}
        </button>
        <button onClick={cancel} disabled={busy} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-bg border border-border disabled:opacity-50">
          Cancel
        </button>
      </div>
      {error && <span className="text-xs font-semibold text-bad">{error}</span>}
    </div>
  );
}
