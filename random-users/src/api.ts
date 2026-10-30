import type { ApiResponse } from './types';

export const BASE_URL = 'https://api.freeapi.app/api/v1';

export function safeHttpUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // ignore invalid URL
  }
  return '';
}

export async function fetchJson<T>(path: string, externalSignal?: AbortSignal): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    let json: ApiResponse<T> | null = null;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      json = null;
    }

    if (!res.ok || json?.success === false || !json) {
      throw new Error(json?.message || `Request failed with status ${res.status}`);
    }

    return json;
  } catch (err: unknown) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds. Please retry.', { cause: err });
    }
    if (err instanceof TypeError) {
      throw new Error('Unable to reach FreeAPI. Please check your internet connection.', { cause: err });
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('An unexpected error occurred.', { cause: err });
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

