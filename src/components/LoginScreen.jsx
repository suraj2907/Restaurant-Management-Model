import { useState } from 'react';
import { signIn } from '../lib/auth.js';

export default function LoginScreen({ restaurantName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const f = e.target;
    try {
      await signIn(f.email.value.trim(), f.password.value);
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Email ya password galat hai.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-surface border border-border rounded-xl p-6 shadow-panel">
        <h1 className="text-lg font-bold text-ink mb-1">{restaurantName || 'Restro Hisaab'}</h1>
        <p className="text-sm text-muted mb-5">Login karke aage badhein.</p>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-xs text-muted font-semibold">Email</label>
          <input name="email" type="email" required autoFocus className="px-3 py-2.5 border border-border rounded-md text-sm" placeholder="aapka@email.com" />
        </div>
        <div className="flex flex-col gap-1 mb-4">
          <label className="text-xs text-muted font-semibold">Password</label>
          <input name="password" type="password" required className="px-3 py-2.5 border border-border rounded-md text-sm" placeholder="••••••••" />
        </div>

        {error && <p className="text-bad text-xs font-semibold mb-3">{error}</p>}

        <button type="submit" disabled={loading} className="w-full px-4 py-2.5 rounded-lg font-semibold text-sm bg-accent text-white hover:bg-accent-dark disabled:opacity-60">
          {loading ? 'Login ho raha hai...' : 'Login'}
        </button>

        <p className="text-center text-[11px] text-muted mt-5">
          © {new Date().getFullYear()} Suraj Jawrani · Surajjawrani2011@gmail.com
        </p>
      </form>
    </div>
  );
}
