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
  area: 'all',
  selectedMeal: null,
  modalLoading: false,
  modalError: null,
  lastFocusedElement: null
};

let modalAbortController = null;

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

function extractIngredients(raw) {
  const list = [];
  for (let i = 1; i <= 20; i += 1) {
    const ing = String(raw?.[`strIngredient${i}`] ?? '').trim();
    const measure = String(raw?.[`strMeasure${i}`] ?? '').trim();
    if (ing) {
      list.push({ ingredient: ing, measure });
    }
  }
  return list;
}

function extractSteps(instructions) {
  const raw = String(instructions ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n|(?=\bSTEP\s+\d+\b)/i)
    .map((line) => line.replace(/^(?:STEP\s*\d+[:.)\s-]*|\d+[.)]\s+)/i, '').trim())
    .filter((line) => line.length > 0);
}

function normalizeMeal(raw, index = 0) {
  const m = raw ?? {};
  const strMeal = String(m.strMeal || 'Untitled Meal');
  const tagsRaw = typeof m.strTags === 'string' ? m.strTags : '';
  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const slug = strMeal.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    id: m.id ?? m.idMeal ?? `meal-${slug}-${index}`,
    strMeal,
    strCategory: String(m.strCategory || 'Uncategorized'),
    strArea: String(m.strArea || 'Global'),
    strInstructions: String(m.strInstructions || ''),
    strMealThumb: safeUrl(m.strMealThumb),
    tags,
    strYoutube: safeUrl(m.strYoutube),
    strSource: safeUrl(m.strSource),
    ingredients: extractIngredients(m),
    steps: extractSteps(m.strInstructions)
  };
}

function syncFilterOptions() {
  const catSelect = document.getElementById('category-select');
  const areaSelect = document.getElementById('area-select');

  if (catSelect) {
    const cats = Array.from(new Set(state.items.map((i) => i.strCategory).filter(Boolean))).sort();
    catSelect.innerHTML = [
      `<option value="all" ${state.category === 'all' ? 'selected' : ''}>All Categories</option>`,
      ...cats.map(
        (c) => `<option value="${esc(c)}" ${state.category === c ? 'selected' : ''}>${esc(c)}</option>`
      )
    ].join('');
  }

  if (areaSelect) {
    const areas = Array.from(new Set(state.items.map((i) => i.strArea).filter(Boolean))).sort();
    areaSelect.innerHTML = [
      `<option value="all" ${state.area === 'all' ? 'selected' : ''}>All Areas</option>`,
      ...areas.map(
        (a) => `<option value="${esc(a)}" ${state.area === a ? 'selected' : ''}>${esc(a)}</option>`
      )
    ].join('');
  }
}

async function loadMeals(pageToLoad = 1) {
  const isFirst = pageToLoad === 1 && state.items.length === 0;
  state.status = isFirst ? 'loading' : 'loading-more';
  state.error = null;
  render();

  try {
    const res = await api(`/public/meals?page=${pageToLoad}&limit=${LIMIT}`);
    const pageData = res?.data ?? {};
    const list = Array.isArray(pageData?.data) ? pageData.data : [];
    const normalized = list.map((item, idx) => normalizeMeal(item, (pageToLoad - 1) * LIMIT + idx));

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
    syncFilterOptions();
    announce(`Loaded ${state.items.length} meals.`);
  } catch (err) {
    state.status = 'error';
    state.error = err?.message || 'Failed to load meals.';
    announce(`Error: ${state.error}`);
  }
  render();
}

async function openMealModal(meal, triggerEl) {
  if (modalAbortController) {
    modalAbortController.abort();
    modalAbortController = null;
  }

  state.selectedMeal = meal;
  state.modalError = null;
  state.modalLoading = false;
  state.lastFocusedElement = triggerEl || document.activeElement;

  const dialog = document.getElementById('meal-modal');
  renderModalContent();
  if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
    document.body.classList.add('overflow-hidden');
    dialog.showModal();
  }

  // Fetch full details by ID if instructions or ingredients are empty
  if ((!meal.strInstructions || meal.ingredients.length === 0) && meal.id) {
    const controller = new AbortController();
    modalAbortController = controller;
    state.modalLoading = true;
    renderModalContent();
    try {
      const res = await api(
        `/public/meals/${encodeURIComponent(meal.id)}`,
        {},
        controller.signal
      );
      if (
        controller.signal.aborted ||
        !state.selectedMeal ||
        String(state.selectedMeal.id) !== String(meal.id)
      ) {
        return;
      }
      if (res?.data) {
        const detailed = normalizeMeal(res.data);
        state.selectedMeal = detailed;
        state.items = state.items.map((item) =>
          String(item.id) === String(detailed.id) ? detailed : item
        );
      }
    } catch (err) {
      if (
        err?.name === 'AbortError' ||
        controller.signal.aborted ||
        !state.selectedMeal ||
        String(state.selectedMeal.id) !== String(meal.id)
      ) {
        return;
      }
      state.modalError = err?.message || 'Could not load full recipe details.';
    } finally {
      if (
        !controller.signal.aborted &&
        state.selectedMeal &&
        String(state.selectedMeal.id) === String(meal.id)
      ) {
        state.modalLoading = false;
        renderModalContent();
      }
    }
  }
}

function closeMealModal() {
  if (modalAbortController) {
    modalAbortController.abort();
    modalAbortController = null;
  }
  const dialog = document.getElementById('meal-modal');
  if (dialog && dialog.open) {
    dialog.close();
  }
}

function getFilteredMeals() {
  const q = state.query.trim().toLowerCase();
  return state.items.filter((m) => {
    const matchesName = !q || m.strMeal.toLowerCase().includes(q);
    const matchesCat = state.category === 'all' || m.strCategory === state.category;
    const matchesArea = state.area === 'all' || m.strArea === state.area;
    return matchesName && matchesCat && matchesArea;
  });
}

function renderSkeletonGrid() {
  const cards = Array.from({ length: 8 })
    .map(
      () => `
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm animate-pulse">
        <div class="h-48 bg-slate-200 dark:bg-slate-800"></div>
        <div class="p-4 space-y-3">
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
          <div class="flex gap-2">
            <div class="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
            <div class="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
          </div>
        </div>
      </div>
    `
    )
    .join('');
  return `<div role="status" aria-busy="true" aria-label="Loading meals" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"><span class="sr-only">Loading meals...</span>${cards}</div>`;
}

function renderCard(meal) {
  return `
    <article class="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-800 transition-all flex flex-col">
      <button
        type="button"
        data-open-meal="${esc(meal.id)}"
        class="text-left flex-1 flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
      >
        <div class="relative h-48 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          ${
            meal.strMealThumb
              ? `<img src="${esc(meal.strMealThumb)}" alt="" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />`
              : `<div class="w-full h-full flex items-center justify-center text-xs text-slate-400">No photo</div>`
          }
        </div>

        <div class="p-4 flex-1 flex flex-col justify-between gap-3">
          <div>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                ${esc(meal.strCategory)}
              </span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                ${esc(meal.strArea)}
              </span>
            </div>

            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              ${esc(meal.strMeal)}
            </h2>
          </div>

          ${
            meal.tags.length > 0
              ? `
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-1">
              ${meal.tags
                .slice(0, 4)
                .map(
                  (tag) => `
                  <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400">
                    #${esc(tag)}
                  </span>
                `
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>
      </button>
    </article>
  `;
}

function renderModalContent() {
  const modalBody = document.getElementById('modal-body');
  if (!modalBody || !state.selectedMeal) return;

  const m = state.selectedMeal;

  modalBody.innerHTML = `
    <div class="flex items-start justify-between gap-4 mb-5">
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-1.5">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            ${esc(m.strCategory)}
          </span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            ${esc(m.strArea)}
          </span>
          ${m.tags
            .map(
              (t) =>
                `<span class="px-2 py-0.5 rounded-md text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">#${esc(t)}</span>`
            )
            .join('')}
        </div>
        <h2 id="modal-meal-title" class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          ${esc(m.strMeal)}
        </h2>
      </div>

      <button
        type="button"
        id="close-modal-btn"
        aria-label="Close recipe modal"
        class="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    ${
      m.strMealThumb
        ? `
      <div class="aspect-video w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-6 border border-slate-200 dark:border-slate-800">
        <img src="${esc(m.strMealThumb)}" alt="${esc(m.strMeal)}" class="w-full h-full object-cover" />
      </div>
    `
        : ''
    }

    ${
      state.modalLoading
        ? `<div role="status" class="py-6 text-center text-sm text-slate-500 animate-pulse">Loading full recipe details...</div>`
        : ''
    }

    ${
      state.modalError
        ? `
      <div role="alert" class="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200">
        <span>${esc(state.modalError)}</span>
        <button type="button" id="retry-modal-btn" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">Retry</button>
      </div>
    `
        : ''
    }

    <div class="space-y-6">
      <!-- Ingredients two-column list -->
      <section>
        <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
          Ingredients (${m.ingredients.length})
        </h3>
        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          ${m.ingredients
            .map(
              (item) => `
              <li class="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 text-sm">
                <span class="font-medium text-slate-900 dark:text-slate-100">${esc(item.ingredient)}</span>
                <span class="text-xs font-semibold text-emerald-700 dark:text-emerald-400">${esc(item.measure)}</span>
              </li>
            `
            )
            .join('')}
        </ul>
      </section>

      <!-- Instructions numbered list -->
      <section>
        <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
          Instructions
        </h3>
        ${
          m.steps.length > 0
            ? `
          <ol class="list-decimal list-inside space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            ${m.steps
              .map(
                (step) => `
                <li class="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                  <span class="ml-1">${esc(step)}</span>
                </li>
              `
              )
              .join('')}
          </ol>
        `
            : `<p class="text-sm text-slate-500">No instructions listed.</p>`
        }
      </section>

      <!-- External links & Close -->
      <div class="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2.5">
          ${
            m.strYoutube
              ? `
            <a
              href="${esc(m.strYoutube)}"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Watch on YouTube
            </a>
          `
              : ''
          }
          ${
            m.strSource
              ? `
            <a
              href="${esc(m.strSource)}"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Source
            </a>
          `
              : ''
          }
        </div>

        <button
          type="button"
          id="modal-done-btn"
          class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Close
        </button>
      </div>
    </div>
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
    app.innerHTML = `
      <div role="alert" class="max-w-lg mx-auto my-8 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 text-center shadow-sm">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">Unable to load meals</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">${esc(state.error)}</p>
        <button
          type="button"
          id="retry-btn"
          class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Retry
        </button>
      </div>
    `;
    restoreFocusId(focusId);
    return;
  }

  const filtered = getFilteredMeals();
  const hasFilters = Boolean(state.query.trim()) || state.category !== 'all' || state.area !== 'all';

  const inlineError =
    state.status === 'error'
      ? `
      <div role="alert" class="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200">
        <span>${esc(state.error)}</span>
        <button type="button" id="retry-btn" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Retry</button>
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
          class="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 aria-disabled:opacity-60 aria-disabled:cursor-wait"
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
          ${hasFilters ? 'No loaded meals match your filters' : 'No meals available'}
        </p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          ${hasFilters ? 'Try clearing your filters or loading more meals below.' : 'Please reload to try again.'}
        </p>
        ${
          hasFilters
            ? `
          <button
            type="button"
            id="clear-filters-btn"
            class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Clear filters
          </button>
        `
            : ''
        }
      </div>
    `
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

  restoreFocusId(focusId);
}

let searchTimer = null;
const searchInput = document.getElementById('search-input');
const categorySelect = document.getElementById('category-select');
const areaSelect = document.getElementById('area-select');
const dialogEl = document.getElementById('meal-modal');

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

if (areaSelect) {
  areaSelect.addEventListener('change', (e) => {
    state.area = e.target.value || 'all';
    render();
  });
}

if (dialogEl) {
  dialogEl.addEventListener('close', () => {
    document.body.classList.remove('overflow-hidden');
    if (modalAbortController) {
      modalAbortController.abort();
      modalAbortController = null;
    }
    state.selectedMeal = null;
    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
      state.lastFocusedElement.focus();
    }
  });

  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) {
      closeMealModal();
    }
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const openBtn = target.closest('[data-open-meal]');
  if (openBtn) {
    const id = openBtn.getAttribute('data-open-meal');
    const meal = state.items.find((m) => String(m.id) === String(id));
    if (meal) openMealModal(meal, openBtn);
    return;
  }

  if (target.closest('#close-modal-btn') || target.closest('#modal-done-btn')) {
    closeMealModal();
    return;
  }

  if (target.closest('#retry-modal-btn') && state.selectedMeal) {
    openMealModal(state.selectedMeal, state.lastFocusedElement);
    return;
  }

  if (target.closest('#retry-btn')) {
    const nextPage = state.items.length === 0 ? 1 : state.page + 1;
    loadMeals(nextPage);
    return;
  }

  if (target.closest('#load-more-btn')) {
    if (state.status !== 'loading-more' && state.hasNext) {
      loadMeals(state.page + 1);
    }
    return;
  }

  if (target.closest('#clear-filters-btn')) {
    state.query = '';
    state.category = 'all';
    state.area = 'all';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (categorySelect) categorySelect.value = 'all';
    if (areaSelect) areaSelect.value = 'all';
    render();
  }
});

// Init
loadMeals(1);
