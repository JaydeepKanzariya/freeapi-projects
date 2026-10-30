import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJson } from './api';
import { ErrorBox } from './components/ErrorBox';
import { SearchBar } from './components/SearchBar';
import { Skeleton } from './components/Skeleton';
import { UserCard } from './components/UserCard';
import { UserModal } from './components/UserModal';
import { usePaginated } from './hooks/usePaginated';
import type { GenderFilter, RandomUser, ViewMode } from './types';

const VIEW_MODE_KEY = 'freeapi_users_view_mode';

function getInitialViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'list' || saved === 'grid') return saved;
  } catch {
    // ignore storage errors
  }
  return 'grid';
}

export default function App() {
  const { items, status, error, hasNext, loadMore, retry } = usePaginated<RandomUser>(
    '/public/randomusers',
    12
  );

  const [query, setQuery] = useState<string>('');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);
  const [selectedUser, setSelectedUser] = useState<RandomUser | null>(null);
  const [randomLoading, setRandomLoading] = useState<boolean>(false);
  const [randomError, setRandomError] = useState<string | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const randomAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (randomAbortRef.current) {
        randomAbortRef.current.abort();
      }
    };
  }, []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSelectUser = useCallback((user: RandomUser, triggerEl: HTMLElement) => {
    lastTriggerRef.current = triggerEl;
    setSelectedUser(user);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedUser(null);
    if (lastTriggerRef.current) {
      lastTriggerRef.current.focus();
    }
  }, []);

  const handleFetchRandomUser = useCallback(async (triggerEl?: HTMLElement) => {
    if (triggerEl) {
      lastTriggerRef.current = triggerEl;
    }
    if (randomAbortRef.current) {
      randomAbortRef.current.abort();
    }
    const controller = new AbortController();
    randomAbortRef.current = controller;

    setRandomLoading(true);
    setRandomError(null);
    try {
      const res = await fetchJson<RandomUser>(
        '/public/randomusers/user/random',
        controller.signal
      );
      if (!controller.signal.aborted && res?.data) {
        setSelectedUser(res.data);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unable to fetch random user.';
      setRandomError(msg);
    } finally {
      if (!controller.signal.aborted) {
        setRandomLoading(false);
      }
    }
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((u) => {
      const fullName = [u?.name?.title, u?.name?.first, u?.name?.last]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const email = (u?.email || '').toLowerCase();
      const username = (u?.login?.username || '').toLowerCase();

      const matchesSearch =
        !q || fullName.includes(q) || email.includes(q) || username.includes(q);
      const matchesGender =
        gender === 'all' || (u?.gender || '').toLowerCase() === gender;

      return matchesSearch && matchesGender;
    });
  }, [items, query, gender]);

  const hasFilters = Boolean(query.trim()) || gender !== 'all';

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0"
              aria-hidden="true"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                FreeAPI Random Users
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                Browse people, search by name or email, and view full profiles
              </p>
            </div>
          </div>

          <span
            aria-live="polite"
            className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800"
          >
            {items.length} loaded
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          gender={gender}
          onGenderChange={setGender}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onRandomUser={handleFetchRandomUser}
          randomLoading={randomLoading}
        />

        {randomError && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200"
          >
            <span>{randomError}</span>
            <button
              type="button"
              onClick={(e) => handleFetchRandomUser(e.currentTarget)}
              className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'loading' && items.length === 0 && (
          <Skeleton viewMode={viewMode} count={8} />
        )}

        {status === 'error' && items.length === 0 && error && (
          <ErrorBox message={error} onRetry={retry} />
        )}

        {items.length > 0 && (
          <>
            {status === 'error' && error && (
              <ErrorBox message={error} onRetry={retry} />
            )}

            {filteredUsers.length === 0 ? (
              <div className="max-w-md mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  No loaded users match your filters
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Try clearing your filters or loading more users below.
                </p>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setGender('all');
                    }}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                    : 'space-y-3'
                }
              >
                {filteredUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    viewMode={viewMode}
                    onSelect={handleSelectUser}
                  />
                ))}
              </div>
            )}

            {hasNext && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={status === 'loading-more'}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60"
                >
                  {status === 'loading-more' ? (
                    <>
                      <svg
                        aria-hidden="true"
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Loading more...
                    </>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <UserModal user={selectedUser} onClose={handleCloseModal} />

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4">Built with FreeAPI</div>
      </footer>
    </div>
  );
}
