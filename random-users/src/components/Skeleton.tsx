import type { ViewMode } from '../types';

export interface SkeletonProps {
  viewMode: ViewMode;
  count?: number;
}

export function Skeleton({ viewMode, count = 8 }: SkeletonProps) {
  const cards = Array.from({ length: count }, (_, idx) => idx);

  if (viewMode === 'list') {
    return (
      <div role="status" className="space-y-3" aria-busy="true" aria-label="Loading users">
        <span className="sr-only">Loading users...</span>
        {cards.map((key) => (
          <div
            key={key}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm animate-pulse flex items-center gap-4"
          >
            <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
            </div>
            <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      aria-busy="true"
      aria-label="Loading users"
    >
      <span className="sr-only">Loading users...</span>
      {cards.map((key) => (
        <div
          key={key}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm animate-pulse flex flex-col items-center text-center space-y-3"
        >
          <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
