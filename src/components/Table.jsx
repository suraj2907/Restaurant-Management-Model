export function TableScroll({ children }) {
  return <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">{children}</div>;
}

export function DataTable({ columns, children }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} className="text-left px-3 py-2.5 bg-bg text-muted font-semibold whitespace-nowrap border-b border-border">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
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

export const td = 'px-3 py-2.5 whitespace-nowrap border-b border-border';
