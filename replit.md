# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a unified Quran + Hafith memorization tracker app. The Quran Reader stays open to all users; the Hafith tracking pages require sign-in via Replit Auth (OIDC).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Replit Auth (OIDC/PKCE) via `openid-client` v6 + `@workspace/replit-auth-web`

## Artifacts

### `artifacts/quran-reader` — Quran Reader + Hafith Tracker Web App
- **Route**: `/` (root)
- **Stack**: React + Vite + Tailwind CSS + Zustand + Wouter
- **Font**: Amiri Quran (Google Fonts) — authentic Uthmanic script
- **View modes**: Mushaf SVG (default) and Surah reading mode
- **Key files**:
  - `src/App.tsx` — router setup (wouter); routes: `/`, `/analytics`, `/track`, `/track/plan`, `/track/library`, `/track/history`, `/track/settings`
  - `src/pages/QuranPage.tsx` — main reader (uses AppShell, queue button moved to top-right)
  - `src/pages/track/Dashboard.tsx` — Hafith dashboard with stats
  - `src/pages/track/DailyPlan.tsx` — daily review plan from SRS scheduler
  - `src/pages/track/Library.tsx` — all tracked segments with mastery info
  - `src/pages/track/HistoryPage.tsx` — full review log history
  - `src/pages/track/SettingsPage.tsx` — backup download/restore (JSON)
  - `src/components/AppShell.tsx` — shared shell: top bar (hamburger left, center, right actions) + slide-out sidebar nav
  - `src/components/AuthRequired.tsx` — auth gate: shows "Sign in" card if not logged in
  - `src/hooks/useAuth.ts` — re-exports `useAuth` from `@workspace/replit-auth-web`
  - `src/store/quranStore.ts` — Zustand store
  - `src/services/quranApi.ts` — fetches from AlQuran.cloud API

### `artifacts/api-server` — Express API Server
- **Route**: `/api`
- **Stack**: Express 5 + Drizzle ORM + PostgreSQL + openid-client
- **Auth routes** (public): `GET /api/auth/user`, `GET /api/login`, `GET /api/callback`, `GET /api/logout`
- **Queue routes** (public, no auth): `POST /api/queues`, `GET /api/queues/:id`
- **Tracker routes** (auth required): `GET/POST/DELETE /api/logs`, `GET /api/srs`, `GET /api/stats`, `GET /api/plans`, `GET /api/plans/today`, `PATCH /api/plans/:id`, `GET /api/backup`, `POST /api/restore`
- **Key files**:
  - `src/app.ts` — Express setup with authMiddleware, cors({ credentials: true })
  - `src/routes/auth.ts` — OIDC login/callback/logout routes
  - `src/routes/tracker.ts` — Hafith API routes with SM-2 SRS algorithm
  - `src/middlewares/authMiddleware.ts` — loads user from session on every request
  - `src/lib/auth.ts` — session CRUD, OIDC config

### `lib/db` — Shared Database
- **Tables**: `shared_queues`, `sessions`, `users`, `logs`, `srs_items`, `daily_plans`
- `src/schema/index.ts` — barrel (exports all schemas)
- `src/schema/auth.ts` — `sessions` + `users` tables (Replit Auth)
- `src/schema/hafith.ts` — `logs`, `srs_items`, `daily_plans` tables

### `lib/replit-auth-web` — Browser Auth Hook
- `src/use-auth.ts` — `useAuth()` hook: calls `GET /api/auth/user`, exposes `user`, `isLoading`, `isAuthenticated`, `login()`, `logout()`

## SVG Mushaf Architecture

- ZIP file: `attached_assets/ligature-basd-svg_1776916961528.zip` (~80MB, 604 SVG files)
- API server opens ZIP fd at startup, parses central directory for all 604 entries, extracts SVGs on-demand with `readSync` + `inflateRawSync`, caches strings in memory
- Each SVG word group: `<g id="md-word-NNN" data-surah="..." data-aya="..." data-word-index-in-ayah="N" data-type="text">`

## Audio Data Format

Two public JSON files power audio playback (both in `artifacts/quran-reader/public/`):

**`quran-surah-audio.json`** — keyed by surah number string:
```json
{ "1": { "surah_number": 1, "audio_url": "https://audio-cdn.tarteel.ai/.../001.mp3", "duration": 46 } }
```

**`quran-segments-data.json`** — keyed by `"{surah}:{ayah}"`:
```json
{
  "1:1": {
    "segments": [[1, 0, 750], [2, 800, 1550], ...],
    "duration_ms": 5735,
    "timestamp_from": 0,
    "timestamp_to": 5735
  }
}
```
All timestamps are **absolute offsets within the surah-level MP3**.

## Word Span DOM Convention

Every Arabic word is rendered as:
```html
<span id="{surah}:{ayah}:{word_index}" class="quran-word ...">word</span>
```

## Auth Flow

- Web: Browser → `GET /api/login?returnTo=/` → Replit OIDC → `GET /api/callback` → session cookie → redirect
- Session stored in `sessions` table (PostgreSQL), TTL 7 days
- `authMiddleware` loads user on every request; tracker routes check `req.isAuthenticated()`
- Quran Reader and shared-queue routes are fully public (no auth required)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
