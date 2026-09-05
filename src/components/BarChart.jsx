import { memo } from 'react';

// Small dependency-free grouped bar chart. `series` = [{ name, color, values: number[] }]
function BarChart({ labels, series, height = 140, valueFmt = (v) => v }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  return (
    <div className="flex items-end gap-2 sm:gap-3.5 overflow-x-auto pb-1" style={{ height: height + 40 }}>
      {labels.map((label, i) => (
        <div key={label + i} className="flex flex-col items-center justify-end flex-1 min-w-[28px]" style={{ height: '100%' }}>
          <div className="flex items-end gap-0.5" style={{ height }}>
            {series.map((s) => (
              <div
                key={s.name}
                className="w-2.5 sm:w-3.5 rounded-t"
                style={{ height: `${(s.values[i] / max) * height}px`, background: s.color }}
                title={`${s.name}: ${valueFmt(s.values[i])}`}
              />
            ))}
          </div>
          <span className="text-[0.7rem] text-muted mt-1 whitespace-nowrap">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default memo(BarChart);
