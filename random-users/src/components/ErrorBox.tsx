export interface ErrorBoxProps {
  message: string;
  onRetry: () => void;
}

export function ErrorBox({ message, onRetry }: ErrorBoxProps) {
  return (
    <div
      role="alert"
      className="max-w-lg mx-auto my-8 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 text-center shadow-sm"
    >
      <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
        Unable to load users
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        Retry
      </button>
    </div>
  );
}

