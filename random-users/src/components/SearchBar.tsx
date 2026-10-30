import { useEffect, useState } from 'react';
import type { GenderFilter, ViewMode } from '../types';

export interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  gender: GenderFilter;
  onGenderChange: (gender: GenderFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onRandomUser: (triggerEl: HTMLElement) => void;
  randomLoading: boolean;
}

export function SearchBar({
  query,
  onQueryChange,
  gender,
  onGenderChange,
  viewMode,
  onViewModeChange,
  onRandomUser,
  randomLoading
}: SearchBarProps) {
  const [localInput, setLocalInput] = useState<string>(query);
  const [prevQuery, setPrevQuery] = useState<string>(query);

  if (query !== prevQuery) {
    setPrevQuery(query);
    setLocalInput(query);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (localInput !== query) {
        onQueryChange(localInput);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [localInput, query, onQueryChange]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1">
        <label htmlFor="user-search-input" className="sr-only">
          Search by name, email or username
        </label>
        <input
          id="user-search-input"
          type="search"
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          placeholder="Search name, email or username..."
          className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        />
        <svg
          className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Gender Filter */}
        <div>
          <label htmlFor="gender-filter" className="sr-only">
            Filter by gender
          </label>
          <select
            id="gender-filter"
            value={gender}
            onChange={(e) => onGenderChange(e.target.value as GenderFilter)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <option value="all">Gender: All</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        {/* Grid / List Segmented Toggle */}
        <div
          role="group"
          aria-label="Layout view mode"
          className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        >
          <button
            type="button"
            aria-pressed={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
              viewMode === 'grid'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
              viewMode === 'list'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            List
          </button>
        </div>

        {/* Random user button */}
        <button
          type="button"
          onClick={(e) => onRandomUser(e.currentTarget)}
          disabled={randomLoading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60"
        >
          {randomLoading ? 'Loading...' : 'Random user'}
        </button>
      </div>
    </div>
  );
}
