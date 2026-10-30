const API = 'https://api.freeapi.app/api/v1';
const TOKEN_KEY = 'freeapi_auth_token';

const state = {
  status: 'loading', // 'idle' | 'loading' | 'error' | 'success'
  submitting: false,
  error: null,
  tab: 'login', // 'login' | 'register'
  user: null,
  showPassword: false,
  form: {
    username: '',
    email: '',
    password: '',
    role: 'USER'
  },
  fieldErrors: {},
  toasts: [],
  avatarBroken: false,
  lastAction: null // function to rerun on Retry
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
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // invalid URL
  }
  return '';
}

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, String(token));
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function captureFocusDescriptor() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active.id) return { type: 'id', value: active.id };
  const tab = active.getAttribute('data-tab');
  if (tab) return { type: 'tab', value: tab };
  return null;
}

function restoreFocusDescriptor(desc) {
  if (!desc) return;
  let target = null;
  if (desc.type === 'id') {
    target = document.getElementById(desc.value);
  } else if (desc.type === 'tab') {
    target = document.querySelector(`[data-tab="${CSS.escape(desc.value)}"]`);
  }
  if (target instanceof HTMLElement && !target.hasAttribute('disabled')) {
    target.focus({ preventScroll: true });
  }
}

function addToast(message, type = 'info') {
  const id = Date.now() + Math.random();
  state.toasts.push({ id, message: String(message || ''), type });
  renderToasts();
  setTimeout(() => {
    state.toasts = state.toasts.filter((t) => t.id !== id);
    renderToasts();
  }, 4000);
}

async function api(path, opts = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const isPublicAuthRoute = path === '/users/login' || path === '/users/register';
  const token = isPublicAuthRoute ? '' : getToken();

  const headers = {
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {})
  };

  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers,
      credentials: 'include',
      signal: controller.signal
    });

    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok || json?.success === false) {
      const msg =
        json?.message ||
        (res.status === 401
          ? 'Session expired or unauthorized. Please sign in.'
          : `Request failed with status ${res.status}`);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out after 15 seconds. Please check your connection and try again.');
      timeoutErr.status = 0;
      throw timeoutErr;
    }
    if (err instanceof TypeError) {
      const netErr = new Error('Unable to reach FreeAPI server. Please check your internet connection and retry.');
      netErr.status = 0;
      throw netErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateForm() {
  const errors = {};
  const username = state.form.username.trim();
  const email = state.form.email.trim();
  const password = state.form.password;

  if (!username) {
    errors.username = 'Username is required.';
  } else if (state.tab === 'register' && (username !== username.toLowerCase() || /\s/.test(username))) {
    errors.username = 'Username must be lowercase with no spaces.';
  }

  if (state.tab === 'register') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (state.tab === 'register' && password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  state.fieldErrors = errors;
  return Object.keys(errors).length === 0;
}

function focusFirstInvalidField() {
  const order = [
    ['username', 'username-input'],
    ['email', 'email-input'],
    ['password', 'password-input']
  ];
  for (const [key, inputId] of order) {
    if (state.fieldErrors[key]) {
      const el = document.getElementById(inputId);
      if (el instanceof HTMLElement) {
        el.focus();
      }
      break;
    }
  }
}

async function restoreSession(isExplicitRetry = false) {
  state.status = 'loading';
  state.error = null;
  state.lastAction = () => restoreSession(true);
  render();

  try {
    const res = await api('/users/current-user', { method: 'GET' });
    const user = res?.data?.user ?? res?.data ?? null;
    if (user && (user.username || user.email || user._id)) {
      state.user = user;
      state.avatarBroken = false;
      state.status = 'success';
      if (isExplicitRetry) {
        addToast(res?.message || 'Session restored successfully.', 'success');
      }
    } else {
      state.user = null;
      state.status = 'idle';
    }
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      setToken('');
      state.user = null;
      state.status = 'idle';
      state.error = null;
    } else {
      state.user = null;
      state.status = 'error';
      state.error = err?.message || 'Could not verify current session.';
      if (isExplicitRetry) {
        addToast(state.error, 'error');
      }
    }
  }
  render();
}

async function submitAuth(payload, mode) {
  state.submitting = true;
  state.error = null;
  state.lastAction = () => submitAuth(payload, mode);
  render();

  try {
    if (mode === 'register') {
      const res = await api('/users/register', {
        method: 'POST',
        body: JSON.stringify({
          username: payload.username,
          email: payload.email,
          password: payload.password,
          role: payload.role
        })
      });
      addToast(res?.message || 'Account registered! You can now sign in.', 'success');
      state.tab = 'login';
      state.form.username = payload.username;
      state.form.password = '';
      state.fieldErrors = {};
      state.status = 'idle';
    } else {
      const res = await api('/users/login', {
        method: 'POST',
        body: JSON.stringify({
          username: payload.username,
          password: payload.password
        })
      });
      const token = res?.data?.accessToken || '';
      setToken(token || '');
      const user = res?.data?.user ?? null;
      state.user = user;
      state.avatarBroken = false;
      state.form.password = '';
      state.fieldErrors = {};
      state.status = 'success';
      addToast(res?.message || 'Logged in successfully!', 'success');
    }
  } catch (err) {
    state.status = 'error';
    state.error = err?.message || 'Authentication request failed.';
    addToast(state.error, 'error');
  } finally {
    state.submitting = false;
    render();
  }
}

async function handleLogout() {
  state.submitting = true;
  state.error = null;
  state.lastAction = () => handleLogout();
  render();

  try {
    const res = await api('/users/logout', { method: 'POST' });
    setToken('');
    state.user = null;
    state.status = 'idle';
    state.form.password = '';
    addToast(res?.message || 'Logged out successfully.', 'success');
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      setToken('');
      state.user = null;
      state.status = 'idle';
      state.form.password = '';
      addToast('Session had already expired. Signed out.', 'info');
    } else {
      state.status = 'error';
      state.error = err?.message || 'Could not log out from server. Please retry.';
      addToast(state.error, 'error');
    }
  } finally {
    state.submitting = false;
    render();
  }
}

function getInitials(user) {
  const name = String(user?.username || user?.email || 'U').trim();
  return name.slice(0, 2).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown date';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(d);
  } catch {
    return 'Unknown date';
  }
}

function renderToasts() {
  const region = document.getElementById('toast-region');
  if (!region) return;
  region.innerHTML = state.toasts
    .map((t) => {
      const isErr = t.type === 'error';
      const isSuccess = t.type === 'success';
      const bg = isErr
        ? 'bg-red-600 text-white border-red-700'
        : isSuccess
        ? 'bg-indigo-600 text-white border-indigo-700'
        : 'bg-slate-900 dark:bg-slate-800 text-white border-slate-700';
      return `
        <div role="status" class="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border shadow-lg text-sm font-medium transition-all ${bg}">
          <span>${esc(t.message)}</span>
          <button type="button" data-dismiss-toast="${esc(t.id)}" aria-label="Dismiss notification" class="p-1 rounded-lg hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      `;
    })
    .join('');
}

function renderSkeleton() {
  return `
    <div role="status" aria-busy="true" aria-label="Checking session status" class="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm animate-pulse">
      <span class="sr-only">Checking session status...</span>
      <div class="flex items-center gap-4 mb-6">
        <div class="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-800"></div>
        <div class="flex-1 space-y-2">
          <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
        </div>
      </div>
      <div class="space-y-4">
        <div class="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        <div class="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        <div class="h-11 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
      </div>
    </div>
  `;
}

function renderErrorBanner() {
  if (!state.error) return '';
  return `
    <div role="alert" class="w-full max-w-md mb-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl p-4 text-sm text-red-800 dark:text-red-200 shadow-sm">
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        </svg>
        <div class="flex-1">
          <p class="font-semibold">Something went wrong</p>
          <p class="mt-1 text-red-700 dark:text-red-300">${esc(state.error)}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" id="retry-btn" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderProfileCard() {
  const u = state.user || {};
  const avatarUrl = !state.avatarBroken ? safeUrl(u?.avatar?.url) : '';
  const username = u?.username || 'user';
  const email = u?.email || 'No email provided';
  const role = u?.role || 'USER';
  const verified = Boolean(u?.isEmailVerified);
  const createdAt = formatDate(u?.createdAt);

  return `
    ${renderErrorBanner()}
    <section aria-label="User Profile" class="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
      <div class="flex flex-col items-center text-center">
        ${
          avatarUrl
            ? `<img id="profile-avatar" src="${esc(avatarUrl)}" alt="${esc(username)}'s avatar" class="w-20 h-20 rounded-full object-cover border-2 border-indigo-500 shadow-sm" />`
            : `<div class="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-2 border-indigo-500/40 flex items-center justify-center text-2xl font-bold shadow-sm" role="img" aria-label="${esc(username)} initials">${esc(getInitials(u))}</div>`
        }
        <h2 class="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">@${esc(username)}</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 break-all">${esc(email)}</p>

        <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Role: ${esc(role)}
          </span>
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
            verified
              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
          }">
            ${verified ? 'Email Verified' : 'Unverified Email'}
          </span>
        </div>
      </div>

      <dl class="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3 text-sm">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-slate-500 dark:text-slate-400">Account Created</dt>
          <dd class="font-medium text-slate-800 dark:text-slate-200">${esc(createdAt)}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-slate-500 dark:text-slate-400">Session Storage</dt>
          <dd class="font-medium text-slate-800 dark:text-slate-200">${getToken() ? 'Cookie + Bearer Token' : 'HTTP Cookie'}</dd>
        </div>
      </dl>

      <div class="mt-8 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          id="refresh-session-btn"
          ${state.submitting ? 'disabled' : ''}
          class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
        >
          Refresh Profile
        </button>
        <button
          type="button"
          id="logout-btn"
          ${state.submitting ? 'disabled' : ''}
          class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
        >
          ${
            state.submitting
              ? `<svg aria-hidden="true" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Signing out...`
              : 'Logout'
          }
        </button>
      </div>
    </section>
  `;
}

function renderAuthForms() {
  const isRegister = state.tab === 'register';
  const fe = state.fieldErrors;

  return `
    ${renderErrorBanner()}
    <div class="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm">
      <!-- Tabs -->
      <div role="tablist" aria-label="Authentication mode" class="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
        <button
          type="button"
          role="tab"
          id="tab-login"
          tabindex="${!isRegister ? '0' : '-1'}"
          aria-selected="${!isRegister}"
          aria-controls="panel-auth"
          data-tab="login"
          class="py-2 px-4 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            !isRegister
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }"
        >
          Login
        </button>
        <button
          type="button"
          role="tab"
          id="tab-register"
          tabindex="${isRegister ? '0' : '-1'}"
          aria-selected="${isRegister}"
          aria-controls="panel-auth"
          data-tab="register"
          class="py-2 px-4 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            isRegister
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }"
        >
          Register
        </button>
      </div>

      <div id="panel-auth" role="tabpanel" aria-labelledby="${isRegister ? 'tab-register' : 'tab-login'}">
        <form id="auth-form" novalidate class="space-y-4">
          <!-- Username -->
          <div>
            <label for="username-input" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Username
            </label>
            <input
              id="username-input"
              name="username"
              type="text"
              autocomplete="username"
              required
              value="${esc(state.form.username)}"
              placeholder="e.g. johndoe"
              aria-invalid="${fe.username ? 'true' : 'false'}"
              ${fe.username ? 'aria-describedby="username-error"' : ''}
              class="w-full px-3.5 py-2.5 rounded-xl border ${
                fe.username
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-slate-300 dark:border-slate-700'
              } bg-white dark:bg-slate-950 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
            ${
              fe.username
                ? `<p id="username-error" role="alert" class="mt-1 text-xs text-red-600 dark:text-red-400">${esc(fe.username)}</p>`
                : isRegister
                ? `<p class="mt-1 text-xs text-slate-400 dark:text-slate-500">Lowercase letters and numbers, no spaces.</p>`
                : ''
            }
          </div>

          ${
            isRegister
              ? `
          <!-- Email -->
          <div>
            <label for="email-input" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email Address
            </label>
            <input
              id="email-input"
              name="email"
              type="email"
              autocomplete="email"
              required
              value="${esc(state.form.email)}"
              placeholder="you@example.com"
              aria-invalid="${fe.email ? 'true' : 'false'}"
              ${fe.email ? 'aria-describedby="email-error"' : ''}
              class="w-full px-3.5 py-2.5 rounded-xl border ${
                fe.email
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-slate-300 dark:border-slate-700'
              } bg-white dark:bg-slate-950 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
            ${
              fe.email
                ? `<p id="email-error" role="alert" class="mt-1 text-xs text-red-600 dark:text-red-400">${esc(fe.email)}</p>`
                : ''
            }
          </div>
          `
              : ''
          }

          <!-- Password -->
          <div>
            <label for="password-input" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password
            </label>
            <div class="relative">
              <input
                id="password-input"
                name="password"
                type="${state.showPassword ? 'text' : 'password'}"
                autocomplete="${isRegister ? 'new-password' : 'current-password'}"
                required
                value="${esc(state.form.password)}"
                placeholder="${isRegister ? 'At least 6 characters' : 'Enter your password'}"
                aria-invalid="${fe.password ? 'true' : 'false'}"
                ${fe.password ? 'aria-describedby="password-error"' : ''}
                class="w-full pl-3.5 pr-16 py-2.5 rounded-xl border ${
                  fe.password
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-slate-300 dark:border-slate-700'
                } bg-white dark:bg-slate-950 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
              <button
                type="button"
                id="toggle-password-btn"
                aria-label="${state.showPassword ? 'Hide password' : 'Show password'}"
                aria-pressed="${state.showPassword}"
                class="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                ${state.showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            ${
              fe.password
                ? `<p id="password-error" role="alert" class="mt-1 text-xs text-red-600 dark:text-red-400">${esc(fe.password)}</p>`
                : ''
            }
          </div>

          ${
            isRegister
              ? `
          <!-- Role -->
          <div>
            <label for="role-select" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Role
            </label>
            <select
              id="role-select"
              name="role"
              class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <option value="USER" ${state.form.role === 'USER' ? 'selected' : ''}>USER</option>
              <option value="ADMIN" ${state.form.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
            </select>
          </div>
          `
              : ''
          }

          <button
            type="submit"
            id="submit-auth-btn"
            ${state.submitting ? 'disabled' : ''}
            class="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            ${
              state.submitting
                ? `<svg aria-hidden="true" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> ${
                    isRegister ? 'Creating account...' : 'Signing in...'
                  }`
                : isRegister
                ? 'Create Account'
                : 'Sign In'
            }
          </button>
        </form>
      </div>
    </div>
  `;
}

function render() {
  const focusDesc = captureFocusDescriptor();
  const main = document.getElementById('app');
  const badge = document.getElementById('header-badge');

  if (badge) {
    if (state.user) {
      badge.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          Signed in as @${esc(state.user.username || 'user')}
        </span>
      `;
    } else {
      badge.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          Guest session
        </span>
      `;
    }
  }

  if (!main) return;

  if (state.status === 'loading') {
    main.innerHTML = renderSkeleton();
    return;
  }

  if (state.user) {
    main.innerHTML = renderProfileCard();
    const avatarImg = document.getElementById('profile-avatar');
    if (avatarImg) {
      avatarImg.addEventListener('error', () => {
        state.avatarBroken = true;
        render();
      });
    }
    restoreFocusDescriptor(focusDesc);
    return;
  }

  main.innerHTML = renderAuthForms();
  restoreFocusDescriptor(focusDesc);
}

// Event delegation
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const tabBtn = target.closest('[data-tab]');
  if (tabBtn) {
    const newTab = tabBtn.getAttribute('data-tab');
    if (newTab && newTab !== state.tab) {
      state.tab = newTab;
      state.fieldErrors = {};
      state.error = null;
      render();
      const nextBtn = document.querySelector(`[data-tab="${CSS.escape(newTab)}"]`);
      if (nextBtn instanceof HTMLElement) nextBtn.focus();
    }
    return;
  }

  if (target.closest('#toggle-password-btn')) {
    state.showPassword = !state.showPassword;
    render();
    const btn = document.getElementById('toggle-password-btn');
    if (btn) btn.focus();
    return;
  }

  if (target.closest('#retry-btn')) {
    if (typeof state.lastAction === 'function') {
      state.lastAction();
    } else {
      restoreSession(true);
    }
    return;
  }

  if (target.closest('#logout-btn')) {
    handleLogout();
    return;
  }

  if (target.closest('#refresh-session-btn')) {
    restoreSession(true);
    return;
  }

  const dismissBtn = target.closest('[data-dismiss-toast]');
  if (dismissBtn) {
    const id = Number(dismissBtn.getAttribute('data-dismiss-toast'));
    state.toasts = state.toasts.filter((t) => t.id !== id);
    renderToasts();
  }
});

// Arrow-key navigation for tabs
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active.getAttribute('role') !== 'tab') return;
  e.preventDefault();
  const nextTab = state.tab === 'login' ? 'register' : 'login';
  state.tab = nextTab;
  state.fieldErrors = {};
  state.error = null;
  render();
  const nextBtn = document.querySelector(`[data-tab="${nextTab}"]`);
  if (nextBtn instanceof HTMLElement) nextBtn.focus();
});

document.addEventListener('input', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const { name, value } = target;
  if (name && Object.prototype.hasOwnProperty.call(state.form, name)) {
    state.form[name] = value;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'auth-form') return;
  e.preventDefault();

  if (!validateForm()) {
    render();
    focusFirstInvalidField();
    return;
  }

  const payload = {
    username: state.form.username.trim(),
    email: state.form.email.trim(),
    password: state.form.password,
    role: state.form.role
  };

  // Clear password field immediately after submit as required
  state.form.password = '';
  submitAuth(payload, state.tab);
});

// Init
restoreSession(false);
