const API = 'https://api.freeapi.app/api/v1';
const LIMIT = 10;
const FAV_KEY = 'freeapi_jokes_favs';

const state = {
  items: [],
  page: 1,
  hasNext: true,
  status: 'idle', // 'idle' | 'loading' | 'loading-more' | 'error' | 'success'
  error: null,
  heroJoke: null,
  heroStatus: 'loading', // 'loading' | 'error' | 'success'
  heroError: null,
  animateHero: false,
  tab: 'browse', // 'browse' | 'favourites'
  favourites: loadFavourites(),
  query: '',
  selectedCategory: 'All',
  copiedKey: null,
  copyFailedKey: null
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
  for (const attr of ['data-fav-id', 'data-copy-id', 'data-tab', 'data-cat-filter', 'data-cat']) {
    if (active.hasAttribute(attr)) {
      return { type: 'attr', attr, value: active.getAttribute(attr) };
    }
  }
  return null;
}

function restoreFocusDescriptor(desc) {
  if (!desc) return;
  let el = null;
  if (desc.type === 'id') {
    el = document.getElementById(desc.value);
  } else if (desc.type === 'attr' && desc.attr && desc.value) {
    el = document.querySelector(`[${desc.attr}="${CSS.escape(desc.value)}"]`);
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

function normalizeJoke(raw) {
  const j = raw ?? {};
  const content = String(j.content || '');
  const cats = Array.isArray(j.categories)
    ? j.categories.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const slug = content
    .slice(0, 36)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return {
    id: j.id ?? j._id ?? `joke-${slug}-${content.length}`,
    content,
    categories: cats
  };
}

function getJokeDisplayCategories(joke) {
  return joke?.categories?.length > 0 ? joke.categories : ['General'];
}

function loadFavourites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeJoke).filter((j) => j.content) : [];
  } catch {
    return [];
  }
}

function saveFavourites(favs) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  } catch {
    // ignore storage errors
  }
}

function isFavourited(id) {
  return state.favourites.some((f) => String(f.id) === String(id));
}

function toggleFavourite(joke) {
  if (!joke) return;
  state.animateHero = false;
  const exists = isFavourited(joke.id);
  if (exists) {
    state.favourites = state.favourites.filter((f) => String(f.id) !== String(joke.id));
    announce('Removed joke from favourites.');
  } else {
    state.favourites = [joke, ...state.favourites];
    announce('Added joke to favourites.');
  }
  saveFavourites(state.favourites);
  render();
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

async function loadRandomJoke() {
  state.heroStatus = 'loading';
  state.heroError = null;
  state.animateHero = false;
  renderHero();

  try {
    const res = await api('/public/randomjokes/joke/random');
    state.heroJoke = normalizeJoke(res?.data ?? {});
    state.heroStatus = 'success';
    state.animateHero = true;
  } catch (err) {
    state.heroStatus = 'error';
    state.heroError = err?.message || 'Could not load a random joke.';
  }
  renderHero();
}

async function loadJokes(pageToLoad = 1) {
  const isFirst = pageToLoad === 1 && state.items.length === 0;
  state.status = isFirst ? 'loading' : 'loading-more';
  state.error = null;
  renderList();

  try {
    const res = await api(`/public/randomjokes?page=${pageToLoad}&limit=${LIMIT}`);
    const pageData = res?.data ?? {};
    const list = Array.isArray(pageData?.data) ? pageData.data : [];
    const normalized = list.map(normalizeJoke).filter((j) => j.content);

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
    announce(`Loaded ${state.items.length} jokes.`);
  } catch (err) {
    state.status = 'error';
    state.error = err?.message || 'Failed to load jokes.';
    announce(`Error: ${state.error}`);
  }
  renderList();
}

async function copyJoke(joke, key) {
  if (!joke?.content) return;
  state.animateHero = false;
  const ok = await writeTextToClipboard(joke.content);
  if (ok) {
    state.copiedKey = key;
    state.copyFailedKey = null;
    announce('Joke copied to clipboard.');
  } else {
    state.copyFailedKey = key;
    state.copiedKey = null;
    announce('Unable to copy to clipboard.');
  }
  render();
  setTimeout(() => {
    if (state.copiedKey === key || state.copyFailedKey === key) {
      state.copiedKey = null;
      state.copyFailedKey = null;
      state.animateHero = false;
      render();
    }
  }, 1500);
}

function getAvailableCategories(sourceList) {
  const set = new Set();
  for (const j of sourceList) {
    for (const c of getJokeDisplayCategories(j)) {
      set.add(c);
    }
  }
  return ['All', ...Array.from(set).sort()];
}

function renderCategoryFilterBar(sourceList) {
  const categories = getAvailableCategories(sourceList);
  if (categories.length <= 1) return '';

  return `
    <div role="group" aria-label="Filter jokes by category" class="flex flex-wrap items-center gap-2 mb-6">
      ${categories
        .map((cat) => {
          const active = state.selectedCategory === cat;
          return `
            <button
              type="button"
              data-cat-filter="${esc(cat)}"
              aria-pressed="${active}"
              class="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
                active
                  ? 'bg-fuchsia-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-fuchsia-400'
              }"
            >
              ${esc(cat)}
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderHero() {
  const focusDesc = captureFocusDescriptor();
  const el = document.getElementById('hero-section');
  if (!el) return;

  const isLoading = state.heroStatus === 'loading';
  const j = state.heroJoke;

  if (state.heroStatus === 'error' && !j) {
    el.innerHTML = `
      <div role="alert" class="bg-white dark:bg-slate-900 border border-fuchsia-300 dark:border-fuchsia-900/70 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">Joke of the moment</span>
          <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">${esc(state.heroError)}</p>
        </div>
        <button
          type="button"
          id="hero-retry-btn"
          class="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
        >
          Retry
        </button>
      </div>
    `;
    restoreFocusDescriptor(focusDesc);
    return;
  }

  if (isLoading && !j) {
    el.innerHTML = `
      <div role="status" aria-busy="true" aria-label="Loading joke of the moment" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm animate-pulse">
        <span class="sr-only">Loading joke of the moment...</span>
        <div class="h-3 w-36 bg-fuchsia-200 dark:bg-fuchsia-900/50 rounded mb-4"></div>
        <div class="space-y-3">
          <div class="h-5 bg-slate-200 dark:bg-slate-800 rounded w-11/12"></div>
          <div class="h-5 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
        </div>
      </div>
    `;
    return;
  }

  const fav = j ? isFavourited(j.id) : false;
  const isCopied = state.copiedKey === 'hero';
  const isCopyFailed = state.copyFailedKey === 'hero';
  const displayCats = getJokeDisplayCategories(j);
  const animClass = state.animateHero ? 'joke-animate' : '';
  state.animateHero = false;

  el.innerHTML = `
    <div class="bg-gradient-to-br from-fuchsia-50 via-white to-fuchsia-100/50 dark:from-slate-900 dark:via-slate-900 dark:to-fuchsia-950/30 border border-fuchsia-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-fuchsia-600/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30">
          Joke of the moment
        </span>

        <div class="flex items-center gap-2">
          ${
            j
              ? `
            <button
              type="button"
              id="hero-fav-btn"
              aria-pressed="${fav}"
              aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}"
              class="p-2 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
                fav
                  ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-fuchsia-400'
              }"
            >
              <svg class="w-4 h-4 ${fav ? 'fill-current' : 'fill-none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <button
              type="button"
              id="hero-copy-btn"
              class="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-fuchsia-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
            >
              ${isCopied ? 'Copied!' : isCopyFailed ? 'Copy failed' : 'Copy'}
            </button>
          `
              : ''
          }
          <button
            type="button"
            id="tell-another-btn"
            ${isLoading ? 'disabled' : ''}
            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 disabled:opacity-60"
          >
            ${
              isLoading
                ? `<svg aria-hidden="true" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Loading...`
                : 'Tell me another'
            }
          </button>
        </div>
      </div>

      ${
        state.heroError
          ? `<p role="alert" class="mb-3 text-xs font-medium text-red-600 dark:text-red-400">${esc(state.heroError)}</p>`
          : ''
      }

      <div class="${animClass}">
        <p class="text-lg sm:text-2xl font-medium leading-relaxed text-slate-900 dark:text-slate-100">
          ${esc(j?.content || '')}
        </p>
        <div class="mt-4 flex flex-wrap gap-1.5">
          ${displayCats
            .map((c) => {
              const active = state.selectedCategory === c;
              return `
                <button
                  type="button"
                  data-cat="${esc(c)}"
                  aria-pressed="${active}"
                  class="px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
                    active
                      ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                      : 'bg-fuchsia-100 dark:bg-fuchsia-950/80 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800 hover:bg-fuchsia-200'
                  }"
                >
                  ${esc(c)}
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;

  restoreFocusDescriptor(focusDesc);
}

function renderJokeItem(joke) {
  const fav = isFavourited(joke.id);
  const copyKey = `item-${joke.id}`;
  const isCopied = state.copiedKey === copyKey;
  const isCopyFailed = state.copyFailedKey === copyKey;
  const displayCats = getJokeDisplayCategories(joke);

  return `
    <article class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm hover:border-fuchsia-300 dark:hover:border-fuchsia-800/70 transition-all">
      <p class="text-base leading-relaxed text-slate-900 dark:text-slate-100">
        ${esc(joke.content)}
      </p>

      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex flex-wrap gap-1.5">
          ${displayCats
            .map((cat) => {
              const active = state.selectedCategory === cat;
              return `
                <button
                  type="button"
                  data-cat="${esc(cat)}"
                  aria-pressed="${active}"
                  class="px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
                    active
                      ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                      : 'bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200/70 dark:border-fuchsia-800/60 hover:bg-fuchsia-100'
                  }"
                >
                  ${esc(cat)}
                </button>
              `;
            })
            .join('')}
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            data-copy-id="${esc(joke.id)}"
            class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
              isCopied
                ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                : isCopyFailed
                ? 'bg-red-600 text-white border-red-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-fuchsia-400'
            }"
          >
            ${isCopied ? 'Copied!' : isCopyFailed ? 'Copy failed' : 'Copy'}
          </button>

          <button
            type="button"
            data-fav-id="${esc(joke.id)}"
            aria-pressed="${fav}"
            aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
              fav
                ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-fuchsia-400'
            }"
          >
            <svg class="w-4 h-4 ${fav ? 'fill-current' : 'fill-none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>${fav ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function getFilteredSource(sourceList) {
  const q = state.query.trim().toLowerCase();
  return sourceList.filter((j) => {
    const matchesSearch =
      !q ||
      j.content.toLowerCase().includes(q) ||
      j.categories.some((c) => c.toLowerCase().includes(q));
    const displayCats = getJokeDisplayCategories(j);
    const matchesCategory =
      state.selectedCategory === 'All' || displayCats.includes(state.selectedCategory);
    return matchesSearch && matchesCategory;
  });
}

function renderList() {
  const focusDesc = captureFocusDescriptor();
  const el = document.getElementById('list-section');
  if (!el) return;

  const isBrowse = state.tab === 'browse';
  const favCount = state.favourites.length;

  const tabsHtml = `
    <div role="tablist" aria-label="Joke views" class="inline-flex p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-6">
      <button
        type="button"
        role="tab"
        id="tab-browse"
        tabindex="${isBrowse ? '0' : '-1'}"
        aria-selected="${isBrowse}"
        aria-controls="jokes-tabpanel"
        data-tab="browse"
        class="px-5 py-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
          isBrowse
            ? 'bg-fuchsia-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }"
      >
        Browse
      </button>
      <button
        type="button"
        role="tab"
        id="tab-favourites"
        tabindex="${!isBrowse ? '0' : '-1'}"
        aria-selected="${!isBrowse}"
        aria-controls="jokes-tabpanel"
        data-tab="favourites"
        class="px-5 py-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
          !isBrowse
            ? 'bg-fuchsia-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }"
      >
        Favourites (${favCount})
      </button>
    </div>
  `;

  if (!isBrowse) {
    if (state.favourites.length === 0) {
      el.innerHTML = `
        ${tabsHtml}
        <div id="jokes-tabpanel" role="tabpanel" aria-labelledby="tab-favourites" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center shadow-sm">
          <p class="text-base font-semibold text-slate-900 dark:text-slate-100">No favourite jokes yet</p>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Click the heart button on any joke to save it for offline reading.</p>
          <button
            type="button"
            data-tab="browse"
            class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
          >
            Browse jokes
          </button>
        </div>
      `;
      restoreFocusDescriptor(focusDesc);
      return;
    }

    const catBarHtml = renderCategoryFilterBar(state.favourites);
    const filteredFavs = getFilteredSource(state.favourites);
    if (filteredFavs.length === 0) {
      el.innerHTML = `
        ${tabsHtml}
        ${catBarHtml}
        <div id="jokes-tabpanel" role="tabpanel" aria-labelledby="tab-favourites" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
          <p class="text-base font-semibold text-slate-900 dark:text-slate-100">No saved jokes match your filters</p>
          <button
            type="button"
            id="clear-search-btn"
            class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
          >
            Clear filters
          </button>
        </div>
      `;
      restoreFocusDescriptor(focusDesc);
      return;
    }

    el.innerHTML = `
      ${tabsHtml}
      ${catBarHtml}
      <div id="jokes-tabpanel" role="tabpanel" aria-labelledby="tab-favourites" class="space-y-4">
        ${filteredFavs.map(renderJokeItem).join('')}
      </div>
    `;
    restoreFocusDescriptor(focusDesc);
    return;
  }

  // Browse tab
  if (state.status === 'loading' && state.items.length === 0) {
    const skeletons = Array.from({ length: 5 })
      .map(
        () => `
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm animate-pulse space-y-3">
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-11/12"></div>
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
        </div>
      `
      )
      .join('');
    el.innerHTML = `${tabsHtml}<div id="jokes-tabpanel" role="status" aria-busy="true" aria-label="Loading jokes" class="space-y-4"><span class="sr-only">Loading jokes...</span>${skeletons}</div>`;
    return;
  }

  if (state.status === 'error' && state.items.length === 0) {
    el.innerHTML = `
      ${tabsHtml}
      <div role="alert" class="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-8 text-center shadow-sm">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">Unable to load jokes</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">${esc(state.error)}</p>
        <button
          type="button"
          id="retry-btn"
          class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
        >
          Retry
        </button>
      </div>
    `;
    restoreFocusDescriptor(focusDesc);
    return;
  }

  const catBarHtml = renderCategoryFilterBar(state.items);
  const filtered = getFilteredSource(state.items);
  const hasFilters = Boolean(state.query.trim()) || state.selectedCategory !== 'All';

  const inlineError =
    state.status === 'error'
      ? `
      <div role="alert" class="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200">
        <span>${esc(state.error)}</span>
        <button type="button" id="retry-btn" class="px-3.5 py-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500">Retry</button>
      </div>
    `
      : '';

  const isLoadingMore = state.status === 'loading-more';
  const loadMoreHtml = state.hasNext
    ? `
      <div class="mt-8 flex justify-center">
        <button
          type="button"
          id="load-more-btn"
          ${isLoadingMore ? 'aria-disabled="true"' : ''}
          class="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 aria-disabled:opacity-60 aria-disabled:cursor-wait"
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
      <div id="jokes-tabpanel" role="tabpanel" aria-labelledby="tab-browse" class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
        <p class="text-base font-semibold text-slate-900 dark:text-slate-100">
          ${hasFilters ? 'No loaded jokes match your filters' : 'No jokes found'}
        </p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          ${hasFilters ? 'Clear filters or load more jokes below.' : ''}
        </p>
        ${
          hasFilters
            ? `
          <button
            type="button"
            id="clear-search-btn"
            class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500"
          >
            Clear filters
          </button>
        `
            : ''
        }
      </div>
    `
      : `
      <div id="jokes-tabpanel" role="tabpanel" aria-labelledby="tab-browse" class="space-y-4">
        ${filtered.map(renderJokeItem).join('')}
      </div>
    `;

  el.innerHTML = `
    ${tabsHtml}
    ${catBarHtml}
    ${inlineError}
    ${contentHtml}
    ${loadMoreHtml}
  `;

  restoreFocusDescriptor(focusDesc);
}

function render() {
  renderHero();
  renderList();
}

function findJokeById(id) {
  if (state.heroJoke && String(state.heroJoke.id) === String(id)) return state.heroJoke;
  return (
    state.items.find((j) => String(j.id) === String(id)) ||
    state.favourites.find((j) => String(j.id) === String(id)) ||
    null
  );
}

let searchTimer = null;
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value || '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = val;
      renderList();
    }, 250);
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  if (target.closest('#tell-another-btn') || target.closest('#hero-retry-btn')) {
    loadRandomJoke();
    return;
  }

  if (target.closest('#hero-fav-btn') && state.heroJoke) {
    toggleFavourite(state.heroJoke);
    return;
  }

  if (target.closest('#hero-copy-btn') && state.heroJoke) {
    copyJoke(state.heroJoke, 'hero');
    return;
  }

  const tabBtn = target.closest('[data-tab]');
  if (tabBtn) {
    const t = tabBtn.getAttribute('data-tab');
    if (t === 'browse' || t === 'favourites') {
      state.tab = t;
      renderList();
      const nextTabEl = document.getElementById(t === 'browse' ? 'tab-browse' : 'tab-favourites');
      if (nextTabEl instanceof HTMLElement) nextTabEl.focus();
    }
    return;
  }

  const catFilterBtn = target.closest('[data-cat-filter]');
  if (catFilterBtn) {
    const cat = catFilterBtn.getAttribute('data-cat-filter') || 'All';
    state.selectedCategory = cat;
    state.animateHero = false;
    render();
    return;
  }

  const catBtn = target.closest('[data-cat]');
  if (catBtn) {
    const cat = catBtn.getAttribute('data-cat') || 'All';
    state.selectedCategory = state.selectedCategory === cat ? 'All' : cat;
    state.animateHero = false;
    render();
    return;
  }

  const favBtn = target.closest('[data-fav-id]');
  if (favBtn) {
    const id = favBtn.getAttribute('data-fav-id');
    const joke = findJokeById(id);
    if (joke) toggleFavourite(joke);
    return;
  }

  const copyBtn = target.closest('[data-copy-id]');
  if (copyBtn) {
    const id = copyBtn.getAttribute('data-copy-id');
    const joke = findJokeById(id);
    if (joke) copyJoke(joke, `item-${joke.id}`);
    return;
  }

  if (target.closest('#retry-btn')) {
    const nextPage = state.items.length === 0 ? 1 : state.page + 1;
    loadJokes(nextPage);
    if (state.heroStatus === 'error') loadRandomJoke();
    return;
  }

  if (target.closest('#load-more-btn')) {
    if (state.status !== 'loading-more' && state.hasNext) {
      loadJokes(state.page + 1);
    }
    return;
  }

  if (target.closest('#clear-search-btn')) {
    state.query = '';
    state.selectedCategory = 'All';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    state.animateHero = false;
    render();
  }
});

// Arrow-key navigation between Browse and Favourites tabs
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active.getAttribute('role') !== 'tab') return;
  e.preventDefault();
  const nextTab = state.tab === 'browse' ? 'favourites' : 'browse';
  state.tab = nextTab;
  renderList();
  const nextTabEl = document.getElementById(nextTab === 'browse' ? 'tab-browse' : 'tab-favourites');
  if (nextTabEl instanceof HTMLElement) nextTabEl.focus();
});

// Init
loadRandomJoke();
loadJokes(1);
