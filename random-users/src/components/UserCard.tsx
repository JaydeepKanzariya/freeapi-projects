import { safeHttpUrl } from '../api';
import type { RandomUser, ViewMode } from '../types';

export interface UserCardProps {
  user: RandomUser;
  viewMode: ViewMode;
  onSelect: (user: RandomUser, triggerEl: HTMLElement) => void;
}

export function UserCard({ user, viewMode, onSelect }: UserCardProps) {
  const fullName = [user?.name?.title, user?.name?.first, user?.name?.last]
    .filter(Boolean)
    .join(' ') || 'Unknown User';
  const avatarUrl =
    safeHttpUrl(user?.picture?.large) ||
    safeHttpUrl(user?.picture?.medium) ||
    safeHttpUrl(user?.picture?.thumbnail);
  const locationText = [user?.location?.city, user?.location?.country]
    .filter(Boolean)
    .join(', ') || 'Unknown location';
  const age = user?.dob?.age;

  if (viewMode === 'list') {
    return (
      <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md hover:border-violet-300 dark:hover:border-violet-800 transition-all">
        <button
          type="button"
          onClick={(e) => onSelect(user, e.currentTarget)}
          className="w-full p-4 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <div className="flex items-center gap-4 min-w-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                loading="lazy"
                className="w-14 h-14 rounded-full object-cover border-2 border-violet-500/40 shrink-0"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold shrink-0"
              >
                {fullName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {fullName}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                {user?.email || 'No email'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 truncate mt-0.5">
                {locationText}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {typeof age === 'number' && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 dark:bg-violet-950/80 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                {age} yrs
              </span>
            )}
          </div>
        </button>
      </article>
    );
  }

  return (
    <article className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md hover:border-violet-300 dark:hover:border-violet-800 transition-all flex flex-col">
      <button
        type="button"
        onClick={(e) => onSelect(user, e.currentTarget)}
        className="flex-1 p-6 text-center flex flex-col items-center justify-between gap-4 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <div className="flex flex-col items-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              loading="lazy"
              className="w-20 h-20 rounded-full object-cover border-2 border-violet-500/40 shadow-sm group-hover:scale-105 transition-transform"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 flex items-center justify-center text-xl font-bold"
            >
              {fullName.slice(0, 2).toUpperCase()}
            </div>
          )}

          <h2 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
            {fullName}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-all">
            {user?.email || 'No email'}
          </p>
        </div>

        <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="truncate">{locationText}</span>
          {typeof age === 'number' && (
            <span className="px-2.5 py-0.5 rounded-full font-semibold bg-violet-50 dark:bg-violet-950/80 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 shrink-0">
              {age} yrs
            </span>
          )}
        </div>
      </button>
    </article>
  );
}
