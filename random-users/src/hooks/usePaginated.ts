import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api';
import type { Paginated } from '../types';

export type RequestStatus = 'idle' | 'loading' | 'loading-more' | 'error' | 'success';

export interface UsePaginatedResult<T> {
  items: T[];
  status: RequestStatus;
  error: string | null;
  hasNext: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function usePaginated<T extends { id: number | string }>(
  endpoint: string,
  limit = 12
): UsePaginatedResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState<number>(1);
  const [retryCounter, setRetryCounter] = useState<number>(0);
  const [status, setStatus] = useState<RequestStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState<boolean>(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${separator}page=${page}&limit=${limit}`;

    fetchJson<Paginated<T>>(url, controller.signal)
      .then((res) => {
        if (!active || controller.signal.aborted) return;
        const pageData = res?.data;
        const incoming = Array.isArray(pageData?.data) ? pageData.data : [];

        setItems((prev) => {
          if (page === 1) {
            const seen = new Set<string>();
            return incoming.filter((item) => {
              const key = String(item.id);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }
          const existingIds = new Set(prev.map((i) => String(i.id)));
          const uniqueNew = incoming.filter((i) => !existingIds.has(String(i.id)));
          return [...prev, ...uniqueNew];
        });

        const currentPage = Number(pageData?.page ?? page);
        const totalPages = Number(pageData?.totalPages ?? 1);
        const next =
          typeof pageData?.nextPage === 'boolean'
            ? pageData.nextPage
            : currentPage < totalPages;

        setHasNext(next);
        setError(null);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Failed to load data.';
        setError(msg);
        setStatus('error');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [endpoint, limit, page, retryCounter]);

  const loadMore = useCallback(() => {
    if (status === 'loading' || status === 'loading-more' || !hasNext) return;
    setError(null);
    if (status === 'error') {
      // Previous page request failed; retry that same page instead of skipping it
      setStatus(items.length === 0 ? 'loading' : 'loading-more');
      setRetryCounter((c) => c + 1);
      return;
    }
    setStatus('loading-more');
    setPage((p) => p + 1);
  }, [status, hasNext, items.length]);

  const retry = useCallback(() => {
    setError(null);
    setStatus(items.length === 0 ? 'loading' : 'loading-more');
    setRetryCounter((c) => c + 1);
  }, [items.length]);

  return { items, status, error, hasNext, loadMore, retry };
}
