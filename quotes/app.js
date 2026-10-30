const API = 'https://api.freeapi.app/api/v1';
const LIMIT = 12;

const state = {
  items: [],
  page: 1,
  hasNext: true,
  status: 'idle', // 'idle' | 'loading' | 'loading-more' | 'error' | 'success'
  error: null,
  heroQuote: null,
  heroStatus: 'loading', // 'loading' | 'error' | 'success'
  heroError: null,
  heroFading: false,
  query: '',
  selectedTag: 'All',
  copiedId: null,
  copyFailedId: null
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function captureFocusDescriptor() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active.id) return { type: 'id', value: active.id };
  if (active.hasAttribute('data-copy-id')) {
    return { type: 'copy', value: active.getAttribute('data-copy-id') };
  }
  if (active.hasAttribute('data-tag')) {
    const inTagsBar = Boolean(active.closest('#tags-section'));
    return { type: 'tag', value: active.getAttribute('data-tag'), inTagsBar };
  }
  return null;
}

function restoreFocusDescriptor(desc) {
  if (!desc) return;
  let el = null;
  if (desc.type === 'id') {
    el = document.getElementById(desc.value);
  } else if (desc.type === 'copy' && desc.value) {
    el = document.querySelector(`[data-copy-id="${CSS.escape(desc.value)}"]`);
  } else if (desc.type === 'tag' && desc.value) {
    const scope = desc.inTagsBar ? document.getElementById('tags-section') : document;
    el = scope?.querySelector(`[data-tag="${CSS.escape(desc.value)}"]`) || null;
  }
  if (el instanceof HTMLElement && !el.hasAttribute('disabled')) {
    el.focus({ preventScroll: true });
  }
}

function announce(msg) {
  const el = document.getElementById('status-live');
  if (el) el.textContent = msg;
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to textarea fallback
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}

async function api(path, opts = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

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
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds. Please retry.');
    }
    if (err instanceof TypeError) {
      throw new Error('Unable to reach FreeAPI. Please check your internet connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeQuote(raw, index = 0) {
  const q = raw ?? {};
  const content = String(q.content || '');
  const author = String(q.author || 'Unknown Author');
  const slug = `${author}-${content.slice(0, 24)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    id: q.id ?? q._id ?? `quote-${slug}-${index}`,
    content,
    author,
    tags: Array.isArray(q.tags) ? q.tags.map((t) => String(t)).filter(Boolean) : [],
    length: Number(q.length ?? content.length)
  };
}

async function loadRandomQuote() {
  const hadQuote = Boolean(state.heroQuote);
  state.heroStatus = 'loading';
  state.heroError = null;
  state.heroFading = true;
  renderHero(false);

  try {
    const res = await api('/public/quotes/random');
    const data = res?.data ?? {};
    state.heroQuote = normalizeQuote(data, 0);
    state.heroStatus = 'success';
  } catch (err) {
    state.heroStatus = 'error';
    state.heroError = err?.message || 'Could not load quote of the moment.';
  } finally {
    if (hadQuote && state.heroStatus === 'success') {
      renderHero(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          state.heroFading = false;
          const bodyEl = document.getElementById('hero-quote-body');
          if (bodyEl) {
            bodyEl.classList.remove('opacity-0');
            bodyEl.classList.add('opacity-100');
          }
          const newBtn = document.getElementById('new-quote-btn');
          if (newBtn instanceof HTMLElement) {
            newBtn.focus({ preventScroll: true });
          }
        });
      });
    } else {
      state.heroFading = false;
      renderHero(false);
    }
  }
}

async function loadQuotes(pageToLoad = 1) {
  const isFirst = pageToLoad === 1 && state.items.length === 0;
  state.status = isFirst ? 'loading' : 'loading-more';
  state.error = null;
  renderGallery();

  try {
    const res = await api(`/public/quotes?page=${pageToLoad}&limit=${LIMIT}`);
    const pageData = res?.data ?? {};
    const list = Array.isArray(pageData?.data) ? pageData.data : [];
    const normalized = list
      .map((item, idx) => normalizeQuote(item, (pageToLoad - 1) * LIMIT + idx))
      .filter((q) => q.content);

    const existingIds = new Set(state.items.map((i) => String(i.id)));
    const uniqueNew = normalized.filter((i) => !existingIds.has(String(i.id)));

    state.items = pageToLoad === 1 ? normalized : [...state.items, ...uniqueNew];
    state.page = Number(pageData?.page ?? pageToLoad);
    const totalPages = Number(pageData?.totalPages ?? 1);
    state.hasNext =
      typeof pageData?.nextPage === 'boolean'
        ? pageData.nextPage
        : state.page < totalPages;
    state.status = 'success';
    announce(`Loaded ${state.items.length} quotes.`);
  } catch (err) {
    state.status = 'error';
    state.error = err?.message || 'Failed to load quotes.';
    announce(`Error: ${state.error}`);
  }
  renderTags();
  renderGallery();
}

async function copyQuoteText(quote, copyKey) {
  const formatted = `“${quote.content}” — ${quote.author}`;
  const ok = await writeTextToClipboard(formatted);
  if (ok) {
    state.copiedId = copyKey;
    state.copyFailedId = null;
    announce(`Copied quote by ${quote.author}`);
  } else {
    state.copyFailedId = copyKey;
    state.copiedId = null;
    announce('Unable to access clipboard.');
  }
  renderHero();
  renderGallery();
  setTimeout(() => {
    if (state.copiedId === copyKey || state.copyFailedId === copyKey) {
      state.copiedId = null;
      state.copyFailedId = null;
      renderHero();
      renderGallery();
    }
  }, 1500);
}

function getAllTags() {
  const tagSet = new Set();
  for (const item of state.items) {
    for (const t of item.tags) {
      tagSet.add(t);
    }
  }
  return ['All', ...Array.from(tagSet).sort()];
}

function getFilteredQuotes() {
  const q = state.query.trim().toLowerCase();
  return state.items.filter((item) => {
    const matchesSearch =
      !q ||
      item.content.toLowerCase().includes(q) ||
      item.author.toLowerCase().includes(q);
    const matchesTag =
      state.selectedTag === 'All' || item.tags.includes(state.selectedTag);
    return matchesSearch && matchesTag;
  });
}

function renderHero(startTransparent = false) {
  const focusDesc = captureFocusDescriptor();
  const el = document.getElementById('hero-section');
  if (!el) return;

  const isLoading = state.heroStatus === 'loading';
  const q = state.heroQuote;

  if (state.heroStatus === 'error' && !q) {
    el.innerHTML = `
      <div role="alert" class="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-900/70 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Quote of the moment</span>
          <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">${esc(state.heroError)}</p>
        </div>
        <button
          type="button"
          id="hero-retry-btn"
          class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Retry
        </button>
      </div>
    `;
    restoreFocusDescriptor(focusDesc);
    return;
  }

  if (isLoading && !q) {
    el.innerHTML = `
      <div role="status" aria-busy="true" aria-label="Loading quote of the moment" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-sm animate-pulse">
        <span class="sr-only">Loading quote of the moment...</span>
        <div class="h-3 w-36 bg-amber-200 dark:bg-amber-900/50 rounded mb-4"></div>
        <div class="space-y-3">
          <div class="h-6 bg-slate-200 dark:bg-slate-800 rounded w-11/12"></div>
          <div class="h-6 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
        </div>
        <div class="mt-6 h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded"></div>
      </div>
    `;
    return;
  }

  const isCopied = state.copiedId === 'hero';
  const isCopyFailed = state.copyFailedId === 'hero';
  const opacityClass = startTransparent ? 'opacity-0' : state.heroFading || isLoading ? 'opacity-30' : 'opacity-100';

  el.innerHTML = `
    <div class="relative overflow-hidden bg-gradient-to-br from-amber-50 via-white to-amber-100/50 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/30 border border-amber-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
          Quote of the moment
        </span>
        <div class="flex items-center gap-2">
          ${
            q
              ? `
            <button
              type="button"
              id="hero-copy-btn"
              class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              ${isCopied ? 'Copied!' : isCopyFailed ? 'Copy failed' : 'Copy'}
            </button>
          `
              : ''
          }
          <button
            type="button"
            id="new-quote-btn"
            ${isLoading ? 'disabled' : ''}
            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60"
          >
            ${
              isLoading
                ? `<svg aria-hidden="true" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Loading...`
                : 'New quote'
            }
          </button>
        </div>
      </div>

      ${
        state.heroError
          ? `<p role="alert" class="mb-3 text-xs font-medium text-red-600 dark:text-red-400">${esc(state.heroError)}</p>`
          : ''
      }

      <div id="hero-quote-body" class="transition-opacity duration-300 ${opacityClass}">
        <blockquote class="font-serif text-xl sm:text-3xl leading-relaxed text-slate-900 dark:text-slate-100">
          “${esc(q?.content || '')}”
        </blockquote>
        <p class="mt-4 text-sm sm:text-base font-semibold text-amber-800 dark:text-amber-400">
          — ${esc(q?.author || 'Unknown')}
        </p>
      </div>
    </div>
  `;

  restoreFocusDescriptor(focusDesc);
}

function renderTags() {
  const focusDesc = captureFocusDescriptor();
  const el = document.getElementById('tags-section');
  if (!el) return;
  const tags = getAllTags();
  if (tags.length <= 1) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      ${tags
        .map((tag) => {
          const active = state.selectedTag === tag;
          return `
            <button
              type="button"
              data-tag="${esc(tag)}"
              aria-pressed="${active}"
              class="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                active
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-amber-400'
              }"
            >
              ${esc(tag)}
            </button>
          `;
        })
        .join('')}
    </div>
  `;

  restoreFocusDescriptor(focusDesc);
}

function renderCard(q) {
  const copyKey = `card-${q.id}`;
  const isCopied = state.copiedId === copyKey;
  const isCopyFailed = state.copyFailedId === copyKey;

  return `
    <article class="break-inside-avoid mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-amber-300 dark:hover:border-amber-800/70 transition-all">
      <blockquote class="font-serif text-base sm:text-lg leading-relaxed text-slate-900 dark:text-slate-100">
        “${esc(q.content)}”
      </blockquote>
      <p class="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
        — ${esc(q.author)}
      </p>

      <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
        <div class="flex flex-wrap gap-1.5">
          ${q.tags
            .map(
              (t) => `
              <button
                type="button"
                data-tag="${esc(t)}"
                class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                #${esc(t)}
              </button>
            `
            )
            .join('')}
        </div>

        <button
          type="button"
          data-copy-id="${esc(q.id)}"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
            isCopied
              ? 'bg-amber-500 text-slate-950 border-amber-500'
              : isCopyFailed
              ? 'bg-red-600 text-white border-red-600'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400'
          }"
        >
          ${isCopied ? 'Copied!' : isCopyFailed ? 'Copy failed' : 'Copy'}
        </button>
      </div>
    </article>
  `;
}

function renderGallery() {
  const focusDesc = captureFocusDescriptor();
  const el = document.getElementById('gallery-section');
  if (!el) return;

  if (state.status === 'loading' && state.items.length === 0) {
    const skeletons = Array.from({ length: 6 })
      .map(
        () => `
        <div class="break-inside-avoid mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm animate-pulse space-y-3">
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-5/6"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mt-4"></div>
        </div>
      `
      )
      .join('');
    el.innerHTML = `<div role="status" aria-busy="true" aria-label="Loading quotes" class="columns-1 sm:columns-2 lg:columns-3 gap-6"><span class="sr-only">Loading quotes...</span>${skeletons}</div>`;
    return;
  }

  if (state.status === 'error' && state.items.length === 0) {
    el.innerHTML = `
      <div role="alert" class="max-w-lg mx-auto my-8 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 text-center shadow-sm">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">Unable to load quotes</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">${esc(state.error)}</p>
        <button
          type="button"
          id="retry-btn"
          class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Retry
        </button>
      </div>
    `;
    restoreFocusDescriptor(focusDesc);
    return;
  }

  const filtered = getFilteredQuotes();
  const hasFilters = Boolean(state.query.trim()) || state.selectedTag !== 'All';

  const inlineError =
    state.status === 'error'
      ? `
      <div role="alert" class="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200">
        <span>${esc(state.error)}</span>
        <button type="button" id="retry-btn" class="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">Retry</button>
      </div>
    `
      : '';

  const isLoadingMore = state.status === 'loading-more';
  const loadMoreHtml = state.hasNext
    ? `
      <div class="mt-10 flex justify-center">
        <button
          type="button"
          id="load-more-btn"
          ${isLoadingMore ? 'aria-disabled="true"' : ''}
          class="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 aria-disabled:opacity-60 aria-disabled:cursor-wait"
        >
          ${
            isLoadingMore
              ? `<svg aria-hidden="true" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Loading more...`
              : 'Load more'
          }
        </button>
      </div>
    `
    : '';

  const contentHtml =
    filtered.length === 0
      ? `
      <div class="max-w-md mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
        <p class="text-base font-semibold text-slate-900 dark:text-slate-100">
          ${hasFilters ? 'No loaded quotes match your filters' : 'No quotes available'}
        </p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          ${hasFilters ? 'Try clearing your filters or loading more quotes below.' : 'Please reload to try again.'}
        </p>
        ${
          hasFilters
            ? `
          <button
            type="button"
            id="clear-filters-btn"
            class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Clear filters
          </button>
        `
            : ''
        }
      </div>
    `
      : `
      <div class="columns-1 sm:columns-2 lg:columns-3 gap-6">
        ${filtered.map(renderCard).join('')}
      </div>
    `;

  el.innerHTML = `
    ${inlineError}
    ${contentHtml}
    ${loadMoreHtml}
  `;

  restoreFocusDescriptor(focusDesc);
}

function render() {
  renderHero();
  renderTags();
  renderGallery();
}

let searchTimer = null;
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value || '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = val;
      renderGallery();
    }, 250);
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  if (target.closest('#new-quote-btn') || target.closest('#hero-retry-btn')) {
    loadRandomQuote();
    return;
  }

  if (target.closest('#hero-copy-btn') && state.heroQuote) {
    copyQuoteText(state.heroQuote, 'hero');
    return;
  }

  const copyBtn = target.closest('[data-copy-id]');
  if (copyBtn) {
    const id = copyBtn.getAttribute('data-copy-id');
    const found = state.items.find((i) => String(i.id) === String(id));
    if (found) {
      copyQuoteText(found, `card-${found.id}`);
    }
    return;
  }

  const tagBtn = target.closest('[data-tag]');
  if (tagBtn) {
    const tag = tagBtn.getAttribute('data-tag') || 'All';
    state.selectedTag = tag;
    renderTags();
    renderGallery();
    const barBtn = document.querySelector(`#tags-section [data-tag="${CSS.escape(tag)}"]`);
    if (barBtn instanceof HTMLElement) {
      barBtn.focus({ preventScroll: true });
    }
    return;
  }

  if (target.closest('#retry-btn')) {
    const nextPage = state.items.length === 0 ? 1 : state.page + 1;
    loadQuotes(nextPage);
    if (state.heroStatus === 'error') loadRandomQuote();
    return;
  }

  if (target.closest('#load-more-btn')) {
    if (state.status !== 'loading-more' && state.hasNext) {
      loadQuotes(state.page + 1);
    }
    return;
  }

  if (target.closest('#clear-filters-btn')) {
    state.query = '';
    state.selectedTag = 'All';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    renderTags();
    renderGallery();
  }
});

// Initial load
loadRandomQuote();
loadQuotes(1);
