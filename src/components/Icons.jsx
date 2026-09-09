import { memo } from 'react';

const PATHS = {
  billing: 'M6 3h9l3 3v15H6V3zm3 6h6M9 12h6M9 15h4',
  reservations: 'M4 5h16v16H4V5zm0 5h16M8 3v4M16 3v4',
  dashboard: 'M4 13h4v7H4v-7zm6-6h4v13h-4V7zm6 3h4v10h-4V10z',
  reports: 'M4 20V10M10 20V4M16 20v-7M4 20h16',
  inventory: 'M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4m0-14v14m8-14v10l-8 4',
  expenses: 'M3 7h18v12H3V7zm0 0l2-3h14l2 3M16 13a2 2 0 100 0',
  staff: 'M8 12a3 3 0 100-6 3 3 0 000 6zm8 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.5-5 6-5s6 2 6 5m2-5c3 0 5.5 2 6 5',
  vendors: 'M3 7h11v9H3V7zm11 3h4l3 3v3h-7v-6zM6 19a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z',
  customers: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8c0-3.5 3-6 7-6s7 2.5 7 6',
  menu: 'M9 3l-2 4H3l2 4-2 4h4l2 4 2-4h4l-2-4 2-4h-4l-2-4z',
  kitchen: 'M8 3v6M12 3v6M16 3v6M4 9h16M6 9v12h12V9M9 21v-5h6v5',
  audit: 'M4 4h16v16H4V4zm4 5h8M8 12h8M8 15h5M15 15l2 2 3-4',
  hamburger: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zm7-1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14c2.8.3 5 2.7 5 6',
  permissions: 'M12 3l7 3v6c0 5-3 8.5-7 9.5-4-1-7-4.5-7-9.5V6l7-3zm-2.5 9l1.8 1.8L15 10.2',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  cart: 'M4 4h2l1.5 11h11L20 8H7.5M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z',
  qr: 'M4 4h6v6H4V4zm2 2v2h2V6H6zm8-2h6v6h-6V4zm2 2v2h2V6h-2zM4 14h6v6H4v-6zm2 2v2h2v-2H6zm8 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2zm0-8h2v2h-2v-2z',
  printer: 'M6 9V4h12v5M6 18H4a1 1 0 01-1-1v-6a1 1 0 011-1h16a1 1 0 011 1v6a1 1 0 01-1 1h-2M6 14h12v7H6v-7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  checklist: 'M9 3h6a1 1 0 011 1v1h1a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h1V4a1 1 0 011-1zM9 12l2 2 4-4'
};

function IconBase({ name, className = 'w-4 h-4' }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export default memo(IconBase);

// Standard Indian FSSAI-style veg/non-veg marker: a square outline with a
// solid dot (veg) or triangle (non-veg) in the same color.
function VegMarkBase({ veg = true, className = 'w-3.5 h-3.5' }) {
  const color = veg ? '#15803D' : '#DC2626';
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 border ${className}`}
      style={{ borderColor: color }}
      title={veg ? 'Veg' : 'Non-Veg'}
    >
      {veg ? (
        <span className="rounded-full" style={{ width: '55%', height: '55%', background: color }} />
      ) : (
        <span
          style={{
            width: 0,
            height: 0,
            borderLeft: '0.28rem solid transparent',
            borderRight: '0.28rem solid transparent',
            borderBottom: `0.45rem solid ${color}`
          }}
        />
      )}
    </span>
  );
}

export const VegMark = memo(VegMarkBase);
