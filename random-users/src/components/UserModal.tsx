import { useEffect, useRef } from 'react';
import { safeHttpUrl } from '../api';
import type { RandomUser } from '../types';

export interface UserModalProps {
  user: RandomUser | null;
  onClose: () => void;
}

function formatStreet(street: RandomUser['location']['street']): string {
  if (!street) return '';
  if (typeof street === 'string') return street;
  return [street.number, street.name].filter(Boolean).join(' ');
}

function formatDob(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(d);
}

export function UserModal({ user, onClose }: UserModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (user) {
      document.body.classList.add('overflow-hidden');
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      document.body.classList.remove('overflow-hidden');
      if (dialog.open) {
        dialog.close();
      }
    }

    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [user]);

  const fullName = user
    ? [user?.name?.title, user?.name?.first, user?.name?.last].filter(Boolean).join(' ')
    : '';
  const largePic =
    safeHttpUrl(user?.picture?.large) ||
    safeHttpUrl(user?.picture?.medium) ||
    safeHttpUrl(user?.picture?.thumbnail);
  const fullAddress = user
    ? [
        formatStreet(user?.location?.street),
        user?.location?.city,
        user?.location?.state,
        user?.location?.country,
        user?.location?.postcode
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-user-name"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      className="m-auto w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 p-0 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-xs"
    >
      {user && (
        <div className="p-6 sm:p-8 max-h-[88vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {largePic ? (
                <img
                  src={largePic}
                  alt={fullName}
                  className="w-20 h-20 rounded-full object-cover border-2 border-violet-500 shadow-sm"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 flex items-center justify-center text-2xl font-bold"
                >
                  {fullName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h2 id="modal-user-name" className="text-xl font-bold">
                  {fullName}
                </h2>
                <p className="text-sm font-medium text-violet-600 dark:text-violet-400">
                  @{user?.login?.username || 'user'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {user?.nat && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                      Nationality: {user.nat}
                    </span>
                  )}
                  {user?.gender && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                      {user.gender}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close user profile"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <dl className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="font-medium break-all">
                {user.email ? (
                  <a
                    href={`mailto:${user.email}`}
                    className="text-violet-600 dark:text-violet-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                  >
                    {user.email}
                  </a>
                ) : (
                  'N/A'
                )}
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
              <dd className="font-medium">
                {user.phone ? (
                  <a
                    href={`tel:${user.phone}`}
                    className="text-violet-600 dark:text-violet-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                  >
                    {user.phone}
                  </a>
                ) : (
                  'N/A'
                )}
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <dt className="text-slate-500 dark:text-slate-400">Cell</dt>
              <dd className="font-medium">
                {user.cell ? (
                  <a
                    href={`tel:${user.cell}`}
                    className="text-violet-600 dark:text-violet-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                  >
                    {user.cell}
                  </a>
                ) : (
                  'N/A'
                )}
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <dt className="text-slate-500 dark:text-slate-400">Date of Birth</dt>
              <dd className="font-medium">
                {formatDob(user?.dob?.date)}
                {typeof user?.dob?.age === 'number' ? ` (${user.dob.age} yrs)` : ''}
              </dd>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <dt className="text-slate-500 dark:text-slate-400">Address</dt>
              <dd className="font-medium sm:text-right">{fullAddress || 'N/A'}</dd>
            </div>
          </dl>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
