export default function Modal({ open, onClose, title, wide, printArea, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-lg p-4 sm:p-5 max-h-[85vh] overflow-y-auto overflow-x-hidden w-full ${
          wide ? 'max-w-[460px]' : 'max-w-[320px]'
        } ${printArea ? 'print-area' : ''}`}
      >
        {title && <h3 className="text-base font-bold mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }) {
  return <div className="flex flex-wrap gap-2 mt-4 no-print">{children}</div>;
}

export function Btn({ children, variant = 'secondary', className = '', ...props }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-dark',
    secondary: 'bg-bg border border-border text-ink hover:bg-border/40',
    link: 'bg-transparent text-bad underline hover:opacity-80 px-0 py-0 font-normal'
  };
  return (
    <button
      className={`px-4 py-2 rounded-lg font-semibold text-sm flex-1 min-w-[90px] ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
