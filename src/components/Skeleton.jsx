import { memo } from 'react';

// Lightweight pulse placeholder shown while a Supabase table is still
// loading its first fetch (see the `loaded` flag from useSupabaseTable).
function SkeletonBase({ className = '' }) {
  return <div className={`animate-pulse bg-border/60 rounded ${className}`} />;
}
export const Skeleton = memo(SkeletonBase);

function SkeletonRowsBase({ rows = 4, cols = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-2.5 border-b border-border">
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
export const SkeletonRows = memo(SkeletonRowsBase);

function SkeletonCardsBase({ count = 6 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-2.5 bg-bg h-[84px]">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2 mb-3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </>
  );
}
export const SkeletonCards = memo(SkeletonCardsBase);
