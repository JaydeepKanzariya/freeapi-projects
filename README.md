# FreeAPI Projects

A collection of 8 self-contained frontend applications built against the [FreeAPI.app](https://api.freeapi.app) public and authentication endpoints. Each application lives in its own independent directory with zero shared code, assets, or configuration so that every folder can be deployed directly as an isolated Vercel project.

## Tech Stack Summary

- **7 Vanilla Apps (`auth`, `youtube`, `products`, `quotes`, `jokes`, `cat`, `meals`):** Semantic HTML5, Tailwind CSS pinned to `3.4.17` via CDN (`darkMode: 'media'`), and modular Vanilla JavaScript (`<script type="module" src="./app.js"></script>`). Zero npm dependencies, bundlers, or frameworks.
- **1 React App (`random-users`):** React 19, Vite, TypeScript (strict mode, zero `any`), and Tailwind CSS v4 (`@tailwindcss/vite`).

---

## Applications Overview

| App | Folder | Brief | Stack | API Endpoint(s) | Live URL |
|---|---|---|---|---|---|
| Authentication | `auth/` | User registration, login, session persistence & profile view | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `POST /users/register`, `POST /users/login`, `POST /users/logout`, `GET /users/current-user` | `https://freeapi-auth.vercel.app` |
| YouTube Videos | `youtube/` | Responsive video grid with ISO duration parsing, search & pagination | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/youtube/videos?page=&limit=12` | `https://freeapi-youtube-ten.vercel.app` |
| Products Listing | `products/` | E-commerce catalog with search, category filter, sorting & gallery modal | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/randomproducts?page=&limit=12` | `https://freeapi-products-psi.vercel.app` |
| Quotes Gallery | `quotes/` | Quote of the moment hero, masonry gallery, tag filter & clipboard copy | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/quotes?page=&limit=12`, `GET /public/quotes/random` | `https://freeapi-quotes-two.vercel.app` |
| Jokes Viewer | `jokes/` | Random joke hero, browse & persistent offline favourites with categories | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/randomjokes?page=&limit=10`, `GET /public/randomjokes/joke/random` | `https://freeapi-jokes-five.vercel.app` |
| Random Cat Viewer | `cat/` | Random cat viewer with image preload skeleton, keyboard shortcuts & history | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/cats/cat/random` | `https://freeapi-cat.vercel.app` |
| Meals Listing | `meals/` | Recipe browser with search, category/area filters & detailed recipe modal | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/meals?page=&limit=12`, `GET /public/meals/{id}` | `https://freeapi-meals-seven.vercel.app` |
| Random Users | `random-users/` | React directory with debounced search, gender filter, grid/list view & modal | React + Vite + TypeScript + Tailwind v4 | `GET /public/randomusers?page=&limit=12`, `GET /public/randomusers/user/random` | `https://freeapi-random-users-olive.vercel.app` |

---

## Application Descriptions & Features

### 1. `auth/` — Authentication Portal (Accent: Indigo)
- Accessible `role="tablist"` switch between **Login** and **Register** forms.
- Client-side validation for lowercase username without spaces, valid email format, and minimum 6-character password with `aria-describedby` error messages and password show/hide toggle.
- Session restoration on load via `GET /users/current-user` using `credentials: "include"` plus a `localStorage` Bearer token (`freeapi_auth_token`) fallback for browsers blocking third-party cookies.
- Authenticated profile card displaying avatar (with initials fallback), role badge, email verification badge, formatted creation date, and logout action.

### 2. `youtube/` — YouTube Videos Listing (Accent: Red)
- Responsive 16:9 video card grid with ISO 8601 duration badges (`PT4M13S` → `4:13`), compact view counts (`Intl.NumberFormat`), and relative publish timestamps (`Intl.RelativeTimeFormat`).
- Client-side debounced search by video title or channel name and deduplicated **Load more** pagination.

### 3. `products/` — Product Listing (Accent: Sky)
- E-commerce cards with discount calculation (`price * (1 - discountPercentage / 100)`), struck-through original price, `-X% OFF` badge, 5-star rating with `aria-label`, and live stock status badge (`In stock`, `Only N left`, `Out of stock`).
- Debounced search (title or brand), dynamic category `<select>`, and sort (`Featured`, `Price ↑`, `Price ↓`, `Rating`).
- Native `<dialog>` detail modal with interactive thumbnail gallery, full description, Esc/backdrop dismissal, and focus restoration.

### 4. `quotes/` — Quotes Listing (Accent: Amber)
- **"Quote of the moment"** serif hero section with fade transitions and a **New quote** button powered by `/public/quotes/random`.
- CSS multi-column masonry gallery (`columns-1 sm:columns-2 lg:columns-3` with `break-inside-avoid`), dynamic tag filter chips, debounced search, and one-click clipboard copy (`“content” — author`) with `"Copied!"` feedback.

### 5. `jokes/` — Jokes Viewer (Accent: Fuchsia)
- **"Joke of the moment"** hero card with custom CSS keyframe fade-and-slide animation (respecting `prefers-reduced-motion`).
- **Browse** and **Favourites (N)** tabs. Favourites are persisted as full joke objects in `localStorage` (`freeapi_jokes_favs`) so saved jokes work offline.
- Category chips (defaulting to `"General"` when empty), clipboard copy button, and `aria-pressed` heart toggle.

### 6. `cat/` — Random Cat Viewer (Accent: Orange)
- Defensive `findImageUrl(data)` helper that inspects known image keys and nested objects to locate valid `http(s)` image URLs.
- Keeps the loading skeleton visible until the `<img>` `onload` event fires, and handles broken image URLs via `img.onerror` with a dedicated Retry state.
- Supports **Space** and **Enter** keyboard shortcuts to fetch a new cat (when focus is not inside an input or another button) and maintains a clickable history strip of the last 5 cats.

### 7. `meals/` — Meals Listing (Accent: Emerald)
- Recipe card grid displaying meal thumbnail, category and cuisine area badges, and comma-separated tag pills.
- Debounced meal name search plus dynamically populated category and area `<select>` filters.
- Native `<dialog>` recipe modal pairing `strIngredient1..20` with `strMeasure1..20` in a two-column ingredient list, splitting `strInstructions` into a numbered `<ol>`, and linking to YouTube and recipe sources.

### 8. `random-users/` — Random Users Directory (Accent: Violet)
- Built with React, Vite, TypeScript (strict, zero `any`), and Tailwind CSS v4.
- Custom `usePaginated` hook using `AbortController` per request, StrictMode-safe double-mount handling, and ID deduplication.
- Debounced search (name, email, username), gender filter (`All`, `Male`, `Female`), persistent Grid/List view toggle (`localStorage`), **Random user** spotlight action, and native `<dialog>` profile modal.

---

## Run Locally

### Vanilla Apps (`auth`, `youtube`, `products`, `quotes`, `jokes`, `cat`, `meals`)
Open `index.html` via any local static HTTP server (ES modules require `http://` rather than `file://` in standard browsers):

```bash
npx serve auth
# or for any other vanilla folder:
npx serve youtube
```

### React App (`random-users`)
```bash
cd random-users
npm i
npm run dev
```

To run production type-checking, build, and linting for `random-users`:
```bash
cd random-users
npm run build
npm run lint
```

---

## Deploy on Vercel

Import the **same GitHub repo 8 times**, once per app. For each project:

| Setting | Vanilla apps (`auth`, `youtube`, `products`, `quotes`, `jokes`, `cat`, `meals`) | `random-users` |
|---|---|---|
| Project name | `freeapi-<folder>` | `freeapi-random-users` |
| Root Directory | `<folder>` | `random-users` |
| Framework Preset | **Other** | **Vite** |
| Build Command | *(empty, override ON)* | `npm run build` |
| Output Directory | `.` *(override ON)* | `dist` |
| Install Command | *(empty, override ON)* | `npm install` |
| Node.js version | default | latest LTS in Project Settings → General |

Optional, to avoid rebuilding all 8 projects on every push: Project Settings → Git → **Ignored Build Step**, with the custom command `git diff HEAD^ HEAD --quiet -- .` (this skips a deploy when nothing in that folder changed).

---

## Manual Test Checklist

Run for **every app**:
- [x] **Loading:** throttle to Slow 3G in DevTools and confirm the skeletons or spinner appear.
- [x] **Offline error + Retry:** go offline in DevTools, confirm the friendly error shows, go online, click Retry and confirm it recovers.
- [x] **Empty search:** type gibberish and confirm the empty state shows and Clear works.
- [x] **Load more:** appends without duplicates and hides on the last page.
- [x] **Mobile width:** at 360 px there is no horizontal scroll and the layout is usable.
- [x] **Keyboard:** Tab through everything, confirm visible focus rings, and confirm modals close on Esc.
- [x] **Dark mode:** toggle the OS or DevTools colour scheme.
- [x] **XSS:** no API text is inserted unescaped (code review).

App-specific checks:
- [x] **auth:** register, login, refresh (session restores), logout (token cleared), validation errors, wrong password shows the API message.
- [x] **jokes:** favourite, reload, still favourited.
- [x] **cat:** Space/Enter shortcut, history click, broken image shows the error state.
- [x] **random-users:** **React StrictMode double mount**. In dev, the first load shows exactly one page with no duplicate cards and no error flash. `npm run build` and `npm run lint` pass.

---

## Notes & Design Decisions

1. **FreeAPI Availability:** `https://api.freeapi.app/api/v1` is occasionally unreachable or slow to respond. Every app uses a 15-second `AbortController` timeout, defensive optional chaining (`res?.data?.data ?? []`), and a prominent **Retry** state so the UI recovers cleanly when connectivity returns.
2. **Cookies & Third-Party Session Fallback in `auth/`:** Every authentication call sends `credentials: "include"` to support HTTP-only session cookies. Because browsers often block cross-site cookies between `vercel.app` / `localhost` and `api.freeapi.app`, `auth/` also persists `data.accessToken` in `localStorage` (`freeapi_auth_token`) on login and attaches `Authorization: Bearer <token>` on subsequent requests, clearing it on logout or `401` responses.
3. **No Pagination in `cat/`:** The `/public/cats/cat/random` endpoint returns a single random cat object rather than a paginated list, so `cat/` uses a **New cat** button and a 5-item local history strip instead of a **Load more** button.
