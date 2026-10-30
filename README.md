# FreeAPI Projects (Web Dev Cohort 2026)

A collection of 8 self-contained frontend applications built against the [FreeAPI.app](https://api.freeapi.app) public and authentication endpoints for the Web Dev Cohort 2026 assignments. Each application lives in its own independent directory with zero shared code, assets, or configuration so that every folder can be deployed directly as an isolated Vercel project.

## Tech Stack Summary

- **7 Vanilla Apps (`auth`, `youtube`, `products`, `quotes`, `jokes`, `cat`, `meals`):** Semantic HTML5, Tailwind CSS pinned to `3.4.17` via CDN (`darkMode: 'media'`), and modular Vanilla JavaScript (`type="module"`). Zero build step or npm dependencies.
- **1 React App (`random-users`):** React 19, Vite, TypeScript (strict mode, zero `any`), and Tailwind CSS v4 (`@tailwindcss/vite`).

## Applications Overview

| App | Folder | Brief | Stack | API Endpoint(s) | Live URL |
|---|---|---|---|---|---|
| Authentication | `auth/` | User registration, login, session persistence & profile view | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `POST /users/register`, `POST /users/login`, `POST /users/logout`, `GET /users/current-user` | `https://freeapi-auth.vercel.app` |
| YouTube Videos | `youtube/` | Responsive video grid with ISO duration parsing, search & pagination | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/youtube/videos?page=&limit=12` | `https://freeapi-youtube.vercel.app` |
| Products Listing | `products/` | E-commerce catalog with search, category filter, sorting & gallery modal | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/randomproducts?page=&limit=12` | `https://freeapi-products.vercel.app` |
| Quotes Gallery | `quotes/` | Quote of the moment hero, masonry gallery, tag filter & clipboard copy | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/quotes?page=&limit=12`, `GET /public/quotes/random` | `https://freeapi-quotes.vercel.app` |
| Jokes Viewer | `jokes/` | Random joke hero, browse & persistent offline favourites with categories | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/randomjokes?page=&limit=10`, `GET /public/randomjokes/joke/random` | `https://freeapi-jokes.vercel.app` |
| Random Cat Viewer | `cat/` | Random cat viewer with image preload skeleton, keyboard shortcuts & history | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/cats/cat/random` | `https://freeapi-cat.vercel.app` |
| Meals Listing | `meals/` | Recipe browser with search, category/area filters & detailed recipe modal | HTML + Tailwind CDN 3.4.17 + Vanilla JS | `GET /public/meals?page=&limit=12`, `GET /public/meals/{id}` | `https://freeapi-meals.vercel.app` |
| Random Users | `random-users/` | React directory with debounced search, gender filter, grid/list view & modal | React + Vite + TypeScript + Tailwind v4 | `GET /public/randomusers?page=&limit=12`, `GET /public/randomusers/user/random` | `https://freeapi-random-users.vercel.app` |
