const API = 'https://api.freeapi.app/api/v1';
const LIMIT = 12;

const state = {
  items: [],
  page: 1,
  hasNext: true,
  status: 'idle', // 'idle' | 'loading' | 'loading-more' | 'error' | 'success'
  error: null,
  query: ''
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  if (typeof url !== 'string') return '';
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

function captureFocusId() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.id) {
    return active.id;
  }
  return null;
}

function restoreFocusId(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el instanceof HTMLElement && !el.hasAttribute('disabled')) {
    el.focus({ preventScroll: true });
  }
}

function announce(msg) {
  const el = document.getElementById('status-live');
  if (el) el.textContent = msg;
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
      throw new Error('Unable to connect to FreeAPI. Check your network and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseDuration(iso) {
  if (typeof iso !== 'string' || !iso.trim()) return '';
  if (iso === 'P0D' || iso === 'PT0S') return 'LIVE';
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return '';
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  if (h === 0 && m === 0 && s === 0) return 'LIVE';
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}

const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatViews(count) {
  if (count === undefined || count === null || count === '') return '';
  const num = Number(count);
  if (!Number.isFinite(num) || num < 0) return '';
  return `${compactFmt.format(num)} views`;
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);

  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1]
  ];

  for (const [unit, secondsInUnit] of units) {
    if (absSec >= secondsInUnit || unit === 'second') {
      const value = Math.round(diffSec / secondsInUnit);
      return rtf.format(value, unit);
    }
  }
  return '';
}

function normalizeVideo(raw) {
  const v = raw?.items ?? raw ?? {};
  const id = typeof v?.id === 'string' ? v.id : v?.id?.videoId ?? '';
  const snippet = v?.snippet ?? {};
  const thumbs = snippet?.thumbnails ?? {};
  const thumbCandidates = [
    safeUrl(thumbs?.high?.url),
    safeUrl(thumbs?.medium?.url),
    safeUrl(thumbs?.default?.url)
  ].filter(Boolean);

  return {
    id: String(id || ''),
    title: String(snippet?.title || 'Untitled Video'),
    channelTitle: String(snippet?.channelTitle || 'Unknown Channel'),
    publishedAt: snippet?.publishedAt || '',
    thumbUrl: thumbCandidates[0] || '',
    fallbackThumbUrl: thumbCandidates[1] || thumbCandidates[2] || '',
    duration: parseDuration(v?.contentDetails?.duration),
    viewCount: v?.statistics?.viewCount ?? null
  };
}

async function loadVideos(pageToLoad = 1) {
  const isFirst = pageToLoad === 1 && state.items.length === 0;
  state.status = isFirst ? 'loading' : 'loading-more';
  state.error = null;
  render();

  try {
    const res = await api(`/public/youtube/videos?page=${pageToLoad}&limit=${LIMIT}`);
    const pageData = res?.data ?? {};
    const list = Array.isArray(pageData?.data) ? pageData.data : [];
    const normalized = list.map(normalizeVideo).filter((item) => item.id);

    const existingIds = new Set(state.items.map((i) => i.id));
    const uniqueNew = normalized.filter((i) => !existingIds.has(i.id));

    state.items = pageToLoad === 1 ? normalized : [...state.items, ...uniqueNew];
    state.page = Number(pageData?.page ?? pageToLoad);
    const totalPages = Number(pageData?.totalPages ?? 1);
    state.hasNext =
      typeof pageData?.nextPage === 'boolean'
        ? pageData.nextPage
        : state.page < totalPages;
    state.status = 'success';
    announce(`Loaded ${state.items.length} videos.`);
  } catch (err) {
    state.status = 'error';
    state.error = err?.message || 'Failed to load YouTube videos.';
    announce(`Error: ${state.error}`);
  }
  render();
}

function getFilteredItems() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.items;
  return state.items.filter(
    (v) =>
      v.title.toLowerCase().includes(q) ||
      v.channelTitle.toLowerCase().includes(q)
  );
}

function renderSkeletonGrid() {
  const cards = Array.from({ length: 8 })
    .map(
      () => `
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm animate-pulse">
        <div class="aspect-video bg-slate-200 dark:bg-slate-800"></div>
        <div class="p-4 space-y-3">
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-11/12"></div>
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mt-2"></div>
        </div>
      </div>
    `
    )
    .join('');

  return `<div role="status" aria-busy="true" aria-label="Loading videos" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"><span class="sr-only">Loading videos...</span>${cards}</div>`;
}

function renderError() {
  return `
    <div role="alert" class="max-w-lg mx-auto my-8 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 text-center shadow-sm">
      <div class="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">Unable to load videos</h2>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">${esc(state.error)}</p>
      <button
        type="button"
        id="retry-btn"
        class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        Retry
      </button>
    </div>
  `;
}

function renderEmpty(hasSearch) {
  return `
    <div class="max-w-md mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
      <p class="text-base font-semibold text-slate-900 dark:text-slate-100">
        ${hasSearch ? 'No loaded videos match your search' : 'No videos available'}
      </p>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        ${
          hasSearch
            ? `No titles or channels matched "${esc(state.query)}" in the loaded pages.`
            : 'Check back later or reload the feed.'
        }
      </p>
      ${
        hasSearch
          ? `
        <button
          type="button"
          id="clear-search-btn"
          class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Clear filters
        </button>
      `
          : ''
      }
    </div>
  `;
}

function renderCard(video) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
  const relTime = formatRelativeTime(video.publishedAt);
  const viewsText = formatViews(video.viewCount);
  const metaParts = [viewsText, relTime].filter(Boolean);
  const metaLine = metaParts.join(' • ');

  return `
    <a
      href="${esc(watchUrl)}"
      target="_blank"
      rel="noopener noreferrer"
      class="group flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-red-300 dark:hover:border-red-800/70 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
    >
      <div class="relative aspect-video bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
        ${
          video.thumbUrl
            ? `<img src="${esc(video.thumbUrl)}" ${
                video.fallbackThumbUrl ? `data-fallback-src="${esc(video.fallbackThumbUrl)}"` : ''
              } alt="" loading="lazy" class="yt-thumb w-full h-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300" />`
            : `<div class="w-full h-full flex items-center justify-center text-slate-400 text-xs">No thumbnail</div>`
        }
        ${
          video.duration
            ? `<span class="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-950/85 text-white text-xs font-semibold tracking-wide">${esc(video.duration)}</span>`
            : ''
        }
      </div>
      <div class="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h2 class="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
            ${esc(video.title)}
          </h2>
          <p class="mt-1.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">
            ${esc(video.channelTitle)}
          </p>
        </div>
        ${
          metaLine
            ? `<p class="mt-2 text-xs text-slate-500 dark:text-slate-500">${esc(metaLine)}</p>`
            : ''
        }
      </div>
    </a>
  `;
}

function render() {
  const focusId = captureFocusId();
  const app = document.getElementById('app');
  if (!app) return;

  if (state.status === 'loading' && state.items.length === 0) {
    app.innerHTML = renderSkeletonGrid();
    return;
  }

  if (state.status === 'error' && state.items.length === 0) {
    app.innerHTML = renderError();
    restoreFocusId(focusId);
    return;
  }

  const filtered = getFilteredItems();

  const inlineError =
    state.status === 'error'
      ? `
      <div role="alert" class="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200">
        <span>${esc(state.error)}</span>
        <button type="button" id="retry-btn" class="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Retry</button>
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
          class="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 aria-disabled:opacity-60 aria-disabled:cursor-wait"
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
      ? renderEmpty(Boolean(state.query.trim()))
      : `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          ${filtered.map(renderCard).join('')}
        </div>
      `;

  app.innerHTML = `
    ${inlineError}
    ${contentHtml}
    ${loadMoreHtml}
  `;

  app.querySelectorAll('img.yt-thumb').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        const fb = img.getAttribute('data-fallback-src');
        if (fb && img.getAttribute('src') !== fb) {
          img.setAttribute('src', fb);
        } else {
          img.remove();
        }
      },
      { once: true }
    );
  });

  restoreFocusId(focusId);
}

// Debounced search listener
let searchTimer = null;
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value || '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = val;
      render();
    }, 250);
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  if (target.closest('#retry-btn')) {
    const nextPage = state.items.length === 0 ? 1 : state.page + 1;
    loadVideos(nextPage);
    return;
  }

  if (target.closest('#load-more-btn')) {
    if (state.status !== 'loading-more' && state.hasNext) {
      loadVideos(state.page + 1);
    }
    return;
  }

  if (target.closest('#clear-search-btn')) {
    state.query = '';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    render();
  }
});

// Initial load
loadVideos(1);
