const API = 'https://api.freeapi.app/api/v1';
const LIMIT = 12;

const state = {
  items: [],
  page: 1,
  hasNext: true,
  status: 'idle', // 'idle' | 'loading' | 'loading-more' | 'error' | 'success'
  error: null,
  query: '',
  category: 'all',
  sort: 'featured',
  selectedProduct: null,
  selectedImageIdx: 0,
  lastFocusedElement: null
};

const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

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
    // invalid URL
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
      throw new Error('Unable to reach FreeAPI. Please check your internet connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeProduct(raw, index = 0) {
  const p = raw ?? {};
  const title = String(p.title || 'Untitled Product');
  const brand = String(p.brand || 'Generic');
  const price = Math.max(0, Number(p.price ?? 0));
  const discountPercentage = Math.max(0, Number(p.discountPercentage ?? 0));
  const discountedPrice = price * (1 - discountPercentage / 100);
  const rating = Math.min(5, Math.max(0, Number(p.rating ?? 0)));
  const stock = Math.max(0, Math.floor(Number(p.stock ?? 0)));
  const thumbnail = safeUrl(p.thumbnail);
  const rawImages = Array.isArray(p.images) ? p.images.map(safeUrl).filter(Boolean) : [];
  const images = rawImages.length > 0 ? rawImages : thumbnail ? [thumbnail] : [];
  const fallbackId = `prod-${title.toLowerCase().replace(/\s+/g, '-')}-${brand.toLowerCase().replace(/\s+/g, '-')}-${index}`;

  return {
    id: p.id ?? p._id ?? fallbackId,
    title,
    description: String(p.description || 'No description provided.'),
    price,
    discountPercentage,
    discountedPrice,
    rating,
    stock,
    brand,
    category: String(p.category || 'uncategorized'),
    thumbnail: thumbnail || images[0] || '',
    images
  };
}

function syncCategoryOptions() {
  const select = document.getElementById('category-select');
  if (!select) return;
  const categories = Array.from(new Set(state.items.map((i) => i.category).filter(Boolean))).sort();
  const current = state.category;

  select.innerHTML = [
    `<option value="all" ${current === 'all' ? 'selected' : ''}>All Categories</option>`,
    ...categories.map(
      (cat) => `<option value="${esc(cat)}" ${current === cat ? 'selected' : ''}>${esc(cat)}</option>`
    )
  ].join('');
}

async function loadProducts(pageToLoad = 1) {
  const isFirst = pageToLoad === 1 && state.items.length === 0;
  state.status = isFirst ? 'loading' : 'loading-more';
  state.error = null;
  render();

  try {
    const res = await api(`/public/randomproducts?page=${pageToLoad}&limit=${LIMIT}`);
    const pageData = res?.data ?? {};
    const list = Array.isArray(pageData?.data) ? pageData.data : [];
    const normalized = list.map((item, idx) => normalizeProduct(item, (pageToLoad - 1) * LIMIT + idx));

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
    syncCategoryOptions();
    announce(`Loaded ${state.items.length} products.`);
  } catch (err) {
    state.status = 'error';
    state.error = err?.message || 'Failed to load products.';
    announce(`Error: ${state.error}`);
  }
  render();
}

function getStockInfo(stock) {
  if (stock >= 10) {
    return {
      label: 'In stock',
      classes: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    };
  }
  if (stock >= 1) {
    return {
      label: `Only ${stock} left`,
      classes: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    };
  }
  return {
    label: 'Out of stock',
    classes: 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
  };
}

function renderStars(rating) {
  const rounded = Math.round(rating * 10) / 10;
  const fullStars = Math.round(rating);
  const starsHtml = Array.from({ length: 5 }, (_, idx) => {
    const filled = idx < fullStars;
    return `
      <svg class="w-4 h-4 ${filled ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-700 fill-current'}" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    `;
  }).join('');

  return `
    <div role="img" class="inline-flex items-center gap-1" aria-label="Rated ${esc(rounded)} out of 5">
      <div class="flex items-center" aria-hidden="true">${starsHtml}</div>
      <span class="text-xs font-semibold text-slate-600 dark:text-slate-400" aria-hidden="true">${esc(rounded.toFixed(1))}</span>
    </div>
  `;
}

function getFilteredAndSorted() {
  const q = state.query.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    const matchesQuery =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q);
    const matchesCat = state.category === 'all' || item.category === state.category;
    return matchesQuery && matchesCat;
  });

  const sorted = [...filtered];
  if (state.sort === 'price-asc') {
    sorted.sort((a, b) => a.discountedPrice - b.discountedPrice);
  } else if (state.sort === 'price-desc') {
    sorted.sort((a, b) => b.discountedPrice - a.discountedPrice);
  } else if (state.sort === 'rating-desc') {
    sorted.sort((a, b) => b.rating - a.rating);
  }
  return sorted;
}

function renderSkeletonGrid() {
  const cards = Array.from({ length: 8 })
    .map(
      () => `
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm animate-pulse">
        <div class="h-48 bg-slate-200 dark:bg-slate-800"></div>
        <div class="p-4 space-y-3">
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
          <div class="h-6 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mt-2"></div>
        </div>
      </div>
    `
    )
    .join('');
  return `<div role="status" aria-busy="true" aria-label="Loading products" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"><span class="sr-only">Loading products...</span>${cards}</div>`;
}

function renderError() {
  return `
    <div role="alert" class="max-w-lg mx-auto my-8 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 text-center shadow-sm">
      <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">Unable to load products</h2>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">${esc(state.error)}</p>
      <button
        type="button"
        id="retry-btn"
        class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        Retry
      </button>
    </div>
  `;
}

function renderEmpty(hasFilters) {
  return `
    <div class="max-w-md mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
      <p class="text-base font-semibold text-slate-900 dark:text-slate-100">
        ${hasFilters ? 'No loaded products match your filters' : 'No products available'}
      </p>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        ${hasFilters ? 'Try adjusting your search query, category filter, or loading more items below.' : 'Please try reloading the catalog.'}
      </p>
      ${
        hasFilters
          ? `
        <button
          type="button"
          id="clear-filters-btn"
          class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Clear filters
        </button>
      `
          : ''
      }
    </div>
  `;
}

function renderCard(p) {
  const stockInfo = getStockInfo(p.stock);
  const discountRounded = Math.round(p.discountPercentage);

  return `
    <article class="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-sky-300 dark:hover:border-sky-800 transition-all flex flex-col">
      <button
        type="button"
        data-open-product="${esc(p.id)}"
        class="text-left flex-1 flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        <div class="relative h-48 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          ${
            p.thumbnail
              ? `<img src="${esc(p.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />`
              : `<div class="w-full h-full flex items-center justify-center text-xs text-slate-400">No image</div>`
          }
          ${
            discountRounded > 0
              ? `<span class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-sky-600 text-white text-xs font-bold shadow-sm">-${esc(discountRounded)}% OFF</span>`
              : ''
          }
          <span class="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-xs font-medium border ${stockInfo.classes}">
            ${esc(stockInfo.label)}
          </span>
        </div>

        <div class="p-4 flex-1 flex flex-col justify-between gap-3">
          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">${esc(p.brand)}</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/60 truncate">
                ${esc(p.category)}
              </span>
            </div>
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-1 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
              ${esc(p.title)}
            </h2>
            <div class="mt-1.5">
              ${renderStars(p.rating)}
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-baseline gap-2">
            <span class="text-lg font-extrabold text-slate-900 dark:text-slate-100">
              ${esc(usdFmt.format(p.discountedPrice))}
            </span>
            ${
              discountRounded > 0
                ? `<span class="text-xs text-slate-400 line-through">${esc(usdFmt.format(p.price))}</span>`
                : ''
            }
          </div>
        </div>
      </button>
    </article>
  `;
}

function renderModalContent(focusThumbIdx = null) {
  const modalBody = document.getElementById('modal-body');
  if (!modalBody || !state.selectedProduct) return;

  const p = state.selectedProduct;
  const stockInfo = getStockInfo(p.stock);
  const discountRounded = Math.round(p.discountPercentage);
  const activeImg = p.images[state.selectedImageIdx] || p.thumbnail || '';

  modalBody.innerHTML = `
    <div class="flex items-start justify-between gap-4 mb-4">
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <span class="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">${esc(p.brand)}</span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">${esc(p.category)}</span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-medium border ${stockInfo.classes}">${esc(stockInfo.label)}</span>
        </div>
        <h2 id="modal-product-title" class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">${esc(p.title)}</h2>
      </div>
      <button
        type="button"
        id="close-modal-btn"
        aria-label="Close product details"
        class="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Image gallery -->
      <div>
        <div class="aspect-square rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-800">
          ${
            activeImg
              ? `<img src="${esc(activeImg)}" alt="${esc(p.title)} - image ${state.selectedImageIdx + 1}" class="w-full h-full object-contain" />`
              : `<div class="w-full h-full flex items-center justify-center text-sm text-slate-400">No image available</div>`
          }
        </div>
        ${
          p.images.length > 1
            ? `
          <div class="mt-3 flex gap-2 overflow-x-auto pb-1">
            ${p.images
              .map(
                (imgUrl, idx) => `
                <button
                  type="button"
                  data-thumb-idx="${idx}"
                  aria-label="View product image ${idx + 1}"
                  aria-pressed="${idx === state.selectedImageIdx}"
                  class="w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    idx === state.selectedImageIdx
                      ? 'border-sky-600 dark:border-sky-400 scale-105'
                      : 'border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                  }"
                >
                  <img src="${esc(imgUrl)}" alt="" class="w-full h-full object-cover" />
                </button>
              `
              )
              .join('')}
          </div>
        `
            : ''
        }
      </div>

      <!-- Details -->
      <div class="flex flex-col justify-between space-y-4">
        <div class="space-y-4">
          <div>${renderStars(p.rating)}</div>

          <div class="flex items-baseline gap-3">
            <span class="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              ${esc(usdFmt.format(p.discountedPrice))}
            </span>
            ${
              discountRounded > 0
                ? `
                <span class="text-base text-slate-400 line-through">${esc(usdFmt.format(p.price))}</span>
                <span class="px-2.5 py-0.5 rounded-full bg-sky-600 text-white text-xs font-bold">-${esc(discountRounded)}% OFF</span>
              `
                : ''
            }
          </div>

          <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            ${esc(p.description)}
          </p>
        </div>

        <div class="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            id="modal-done-btn"
            class="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  if (focusThumbIdx !== null) {
    const thumbBtn = modalBody.querySelector(`[data-thumb-idx="${focusThumbIdx}"]`);
    if (thumbBtn instanceof HTMLElement) {
      thumbBtn.focus({ preventScroll: true });
    }
  }
}

function openModal(product, triggerEl) {
  state.selectedProduct = product;
  state.selectedImageIdx = 0;
  state.lastFocusedElement = triggerEl || document.activeElement;
  renderModalContent();
  const dialog = document.getElementById('product-modal');
  if (dialog && typeof dialog.showModal === 'function') {
    document.body.classList.add('overflow-hidden');
    dialog.showModal();
  }
}

function closeModal() {
  const dialog = document.getElementById('product-modal');
  if (dialog && dialog.open) {
    dialog.close();
  }
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

  const list = getFilteredAndSorted();
  const hasFilters = Boolean(state.query.trim()) || state.category !== 'all' || state.sort !== 'featured';

  const inlineError =
    state.status === 'error'
      ? `
      <div role="alert" class="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200">
        <span>${esc(state.error)}</span>
        <button type="button" id="retry-btn" class="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Retry</button>
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
          class="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 aria-disabled:opacity-60 aria-disabled:cursor-wait"
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
    list.length === 0
      ? renderEmpty(hasFilters)
      : `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          ${list.map(renderCard).join('')}
        </div>
      `;

  app.innerHTML = `
    ${inlineError}
    ${contentHtml}
    ${loadMoreHtml}
  `;

  restoreFocusId(focusId);
}

// Search & Filter listeners
let searchTimer = null;
const searchInput = document.getElementById('search-input');
const categorySelect = document.getElementById('category-select');
const sortSelect = document.getElementById('sort-select');
const dialogEl = document.getElementById('product-modal');

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

if (categorySelect) {
  categorySelect.addEventListener('change', (e) => {
    state.category = e.target.value || 'all';
    render();
  });
}

if (sortSelect) {
  sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value || 'featured';
    render();
  });
}

if (dialogEl) {
  dialogEl.addEventListener('close', () => {
    document.body.classList.remove('overflow-hidden');
    state.selectedProduct = null;
    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
      state.lastFocusedElement.focus();
    }
  });

  // Backdrop click closes dialog
  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) {
      closeModal();
    }
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const openBtn = target.closest('[data-open-product]');
  if (openBtn) {
    const id = openBtn.getAttribute('data-open-product');
    const prod = state.items.find((i) => String(i.id) === String(id));
    if (prod) openModal(prod, openBtn);
    return;
  }

  const thumbBtn = target.closest('[data-thumb-idx]');
  if (thumbBtn) {
    const idx = Number(thumbBtn.getAttribute('data-thumb-idx') || 0);
    state.selectedImageIdx = idx;
    renderModalContent(idx);
    return;
  }

  if (target.closest('#close-modal-btn') || target.closest('#modal-done-btn')) {
    closeModal();
    return;
  }

  if (target.closest('#retry-btn')) {
    const nextPage = state.items.length === 0 ? 1 : state.page + 1;
    loadProducts(nextPage);
    return;
  }

  if (target.closest('#load-more-btn')) {
    if (state.status !== 'loading-more' && state.hasNext) {
      loadProducts(state.page + 1);
    }
    return;
  }

  if (target.closest('#clear-filters-btn')) {
    state.query = '';
    state.category = 'all';
    state.sort = 'featured';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (categorySelect) categorySelect.value = 'all';
    if (sortSelect) sortSelect.value = 'featured';
    render();
  }
});

// Initial load
loadProducts(1);
