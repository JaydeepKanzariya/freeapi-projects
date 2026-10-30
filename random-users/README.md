# FreeAPI Random Users (`random-users/`)

A React + Vite + TypeScript + Tailwind CSS v4 directory application for browsing and inspecting random users from `https://api.freeapi.app/api/v1/public/randomusers`.

## Features

- **StrictMode-safe `usePaginated` Hook:** Uses per-request `AbortController` cleanup, deduplicates users by `id`, and retries failed pages without skipping.
- **Search & Filtering:** Client-side debounced search (name, email, username), gender filter (`All`, `Male`, `Female`), and persistent `Grid` / `List` view toggle stored in `localStorage`.
- **Accessible Native `<dialog>` Modal:** Centered modal with scroll lock, Esc/backdrop dismissal, and focus restoration to the triggering card or **Random user** button.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
```
