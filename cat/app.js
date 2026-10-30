const API = 'https://api.freeapi.app/api/v1';

const state = {
  status: 'idle', // 'idle' | 'loading' | 'error' | 'success'
  error: null,
  currentCat: null,
  imageLoading: false,
  imageError: false,
  history: [], // up to 5 cats whose images have loaded
  lastFocusedSelector: null
};

let activeController = null;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // ignore
  }
  return null;
}

function findImageUrl(data) {
  if (!data || typeof data !== 'object') return null;
  const priorityKeys = ['image', 'url', 'img', 'photo', 'thumbnail', 'src', 'picture'];

  // 1. Check known keys first at top-level
  for (const key of priorityKeys) {
    const val = data[key];
    if (typeof val === 'string' && /^https?:\/\//i.test(val.trim())) {
      const valid = safeUrl(val);
      if (valid) return valid;
    }
    if (val && typeof val === 'object' && typeof val.url === 'string' && /^https?:\/\//i.test(val.url.trim())) {
      const valid = safeUrl(val.url);
      if (valid) return valid;
    }
  }

  // 2. Check all top-level string values starting with http
  for (const val of Object.values(data)) {
    if (typeof val === 'string' && /^https?:\/\//i.test(val.trim())) {
      const valid = safeUrl(val);
      if (valid) return valid;
    }
  }

  // 3. Search nested objects one level deep
  for (const val of Object.values(data)) {
    if (val && typeof val === 'object') {
      for (const key of priorityKeys) {
        if (typeof val[key] === 'string' && /^https?:\/\//i.test(val[key].trim())) {
          const valid = safeUrl(val[key]);
          if (valid) return valid;
        }
      }
      for (const nestedVal of Object.values(val)) {
        if (typeof nestedVal === 'string' && /^https?:\/\//i.test(nestedVal.trim())) {
          const valid = safeUrl(nestedVal);
          if (valid) return valid;
        }
      }
    }
  }

  return null;
}

function announce(msg) {
  const el = document.getElementById('status-live');
  if (el) el.textContent = msg;
}

function captureFocusSelector() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return state.lastFocusedSelector;
  if (active.id) return `#${CSS.escape(active.id)}`;
  if (active.hasAttribute('data-history-id')) {
    const hid = active.getAttribute('data-history-id') || '';
    return `[data-history-id="${CSS.escape(hid)}"]`;
  }
  return state.lastFocusedSelector;
}

function restoreFocusSelector(selector) {
  if (!selector) return;
  const el = document.querySelector(selector);
  if (el instanceof HTMLElement && !el.hasAttribute('disabled')) {
    el.focus({ preventScroll: true });
  }
}

async function api(path, opts = {}, externalSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { Accept: 'application/json', ...(opts.headers || {}) },
      signal: controller.signal
    });

    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok || json?.success === false) {
      throw new Error(json?.message || `Request failed with status ${res.status}`);
    }
    return json;
  } catch (err) {
    if (externalSignal?.aborted) {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds. Please retry.');
    }
    if (err instanceof TypeError) {
      throw new Error('Unable to reach FreeAPI. Please check your internet connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

function normalizeCat(raw) {
  const c = raw ?? {};
  const imageUrl = findImageUrl(c);
  const name = String(c.name || 'Mystery Cat');
  const slug = `${name}-${imageUrl || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return {
    id: String(c.id ?? c._id ?? `cat-${slug}`),
    imageUrl,
    name,
    origin: String(c.origin || ''),
    temperament: String(c.temperament || ''),
    description: String(c.description || '')
  };
}

function pushToHistory(cat) {
  if (!cat || !cat.imageUrl) return;
  const filtered = state.history.filter(
    (h) => String(h.id) !== String(cat.id) && h.imageUrl !== cat.imageUrl
  );
  state.history = [cat, ...filtered].slice(0, 5);
}

async function fetchRandomCat() {
  if (state.status === 'loading' || state.imageLoading) return;
  if (activeController) {
    activeController.abort();
  }
  const controller = new AbortController();
  activeController = controller;

  state.lastFocusedSelector = '#new-cat-btn';
  state.status = 'loading';
  state.error = null;
  state.imageError = false;
  state.imageLoading = true;
  render();

  try {
    const res = await api('/public/cats/cat/random', {}, controller.signal);
    if (controller.signal.aborted) return;
    const cat = normalizeCat(res?.data ?? {});
    state.currentCat = cat;
    state.status = 'success';

    if (!cat.imageUrl) {
      state.imageLoading = false;
      state.imageError = true;
    }
    announce(`Loaded cat breed: ${cat.name}`);
  } catch (err) {
    if (err?.name === 'AbortError' || controller.signal.aborted) return;
    state.status = 'error';
    state.imageLoading = false;
    state.error = err?.message || 'Could not fetch a random cat.';
    announce(`Error: ${state.error}`);
  }
  render();
}

function selectFromHistory(catId) {
  const found = state.history.find((h) => String(h.id) === String(catId));
  if (!found) return;
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
  state.lastFocusedSelector = `[data-history-id="${CSS.escape(String(found.id))}"]`;
  state.currentCat = found;
  state.status = 'success';
  state.error = null;
  state.imageError = false;
  state.imageLoading = true;
  announce(`Showing ${found.name} from history`);
  render();
}

function renderHistoryStrip() {
  if (state.history.length === 0) return '';
  return `
    <div class="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Recent Cats (${state.history.length}/5)
        </h3>
        <span class="text-xs text-slate-400">Click to revisit</span>
      </div>
      <div class="flex items-center gap-3 overflow-x-auto pb-1">
        ${state.history
          .map((item) => {
            const active =
              state.currentCat && String(state.currentCat.id) === String(item.id);
            return `
              <button
                type="button"
                data-history-id="${esc(item.id)}"
                aria-label="View ${esc(item.name)}"
                aria-pressed="${Boolean(active)}"
                class="group relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  active
                    ? 'border-orange-500 ring-2 ring-orange-500/30 scale-105'
                    : 'border-slate-200 dark:border-slate-800 opacity-75 hover:opacity-100'
                }"
              >
                <img
                  src="${esc(item.imageUrl)}"
                  alt=""
                  loading="lazy"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </button>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function render() {
  const focusSelector = captureFocusSelector();
  const app = document.getElementById('app');
  if (!app) return;

  const isBusy = state.status === 'loading' || state.imageLoading;
  const c = state.currentCat;
  const temperaments = c?.temperament
    ? c.temperament
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  if (state.status === 'error') {
    app.innerHTML = `
      <div role="alert" class="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-8 text-center shadow-sm">
        <div class="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">Unable to fetch cat</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">${esc(state.error)}</p>
        <button
          type="button"
          id="retry-btn"
          class="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          Retry
        </button>
      </div>
      ${renderHistoryStrip()}
    `;
    restoreFocusSelector(focusSelector);
    return;
  }

  app.innerHTML = `
    <article class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      <!-- Image container with skeleton until img.onload fires -->
      <div class="relative aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
        ${
          isBusy
            ? `
            <div role="status" aria-busy="true" aria-label="Loading cat photo" class="absolute inset-0 bg-slate-200 dark:bg-slate-800 animate-pulse flex flex-col items-center justify-center gap-2 z-10">
              <svg aria-hidden="true" class="w-8 h-8 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Summoning kitty...</span>
            </div>
          `
            : ''
        }

        ${
          state.imageError
            ? `
            <div role="alert" class="p-6 text-center z-20">
              <p class="text-sm font-semibold text-red-600 dark:text-red-400">Image failed to load</p>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">The cat image URL was unreachable or broken.</p>
              <button
                type="button"
                id="retry-img-btn"
                class="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                Retry
              </button>
            </div>
          `
            : c?.imageUrl
            ? `
            <img
              id="cat-photo"
              src="${esc(c.imageUrl)}"
              alt="${esc(c.name)}"
              class="w-full h-full object-cover transition-opacity duration-300 ${
                state.imageLoading ? 'opacity-0' : 'opacity-100'
              }"
            />
          `
            : ''
        }
      </div>

      <!-- Content & Controls -->
      <div class="p-6 sm:p-8 space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                ${esc(c?.name || 'Loading breed...')}
              </h2>
              ${
                c?.origin
                  ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800">${esc(c.origin)}</span>`
                  : ''
              }
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            ${
              c?.imageUrl && !state.imageError
                ? `
              <a
                href="${esc(c.imageUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                Open image
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            `
                : ''
            }

            <button
              type="button"
              id="new-cat-btn"
              ${isBusy ? 'disabled' : ''}
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-60"
            >
              ${
                isBusy
                  ? `<svg aria-hidden="true" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Loading...`
                  : 'New cat'
              }
            </button>
          </div>
        </div>

        ${
          c?.description
            ? `<p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">${esc(c.description)}</p>`
            : ''
        }

        ${
          temperaments.length > 0
            ? `
          <div class="pt-2 flex flex-wrap gap-1.5">
            ${temperaments
              .map(
                (t) => `
                <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  ${esc(t)}
                </span>
              `
              )
              .join('')}
          </div>
        `
            : ''
        }
      </div>
    </article>

    ${renderHistoryStrip()}
  `;

  const imgEl = document.getElementById('cat-photo');
  if (imgEl) {
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      if (state.imageLoading) {
        state.imageLoading = false;
        pushToHistory(state.currentCat);
        render();
        return;
      }
    } else {
      imgEl.addEventListener(
        'load',
        () => {
          state.imageLoading = false;
          state.imageError = false;
          pushToHistory(state.currentCat);
          render();
        },
        { once: true }
      );
      imgEl.addEventListener(
        'error',
        () => {
          state.imageLoading = false;
          state.imageError = true;
          render();
        },
        { once: true }
      );
    }
  }

  restoreFocusSelector(focusSelector);
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  if (
    target.closest('#new-cat-btn') ||
    target.closest('#retry-btn') ||
    target.closest('#retry-img-btn')
  ) {
    fetchRandomCat();
    return;
  }

  const histBtn = target.closest('[data-history-id]');
  if (histBtn) {
    const id = histBtn.getAttribute('data-history-id');
    if (id) selectFromHistory(id);
  }
});

// Space or Enter triggers New cat, unless focus is in an input or on another button/link
document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const active = document.activeElement;
  if (active instanceof Element) {
    const tag = active.tagName.toLowerCase();
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      tag === 'a' ||
      (tag === 'button' && active.id !== 'new-cat-btn')
    ) {
      return;
    }
    if (active.id === 'new-cat-btn') {
      return;
    }
  }

  e.preventDefault();
  fetchRandomCat();
});

// Initial load
fetchRandomCat();
