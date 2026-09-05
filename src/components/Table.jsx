export function TableScroll({ children }) {
  return <div className="w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-card">{children}</div>;
}

export function DataTable({ columns, children }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} className="text-left px-3 py-2.5 bg-well text-muted font-semibold text-xs uppercase tracking-wide whitespace-nowrap border-b border-border">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&>tr:hover]:bg-well/60">{children}</tbody>
    </table>
  );
}

export function EmptyRow({ span, children }) {
  return (
    <tr>
      <td colSpan={span} className="text-center text-muted text-sm py-5">
        {children}
      </td>
    </tr>
  );
}

export const td = 'px-3 py-2.5 whitespace-nowrap border-b border-border tabular-nums';
