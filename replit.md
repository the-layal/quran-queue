# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a Quran web reader app modeled after Tanzil.net.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### `artifacts/quran-reader` — Quran Reader Web App
- **Route**: `/` (root)
- **Stack**: React + Vite + Tailwind CSS + Zustand + Wouter
- **Font**: Amiri Quran (Google Fonts) — authentic Uthmanic script
- **View modes**: Mushaf SVG (default) and Surah reading mode
- **Key files**:
  - `src/App.tsx` — router setup (wouter), routes: `/` and `/analytics`
  - `src/pages/QuranPage.tsx` — main reader with pagination (604 Mushaf pages)
  - `src/pages/AnalyticsPage.tsx` — placeholder analytics view
  - `src/store/quranStore.ts` — Zustand store (currentPage, viewMode, settings); default viewMode="mushaf"
  - `src/services/quranApi.ts` — fetches from AlQuran.cloud API, merges with audio data
  - `src/types/quran.ts` — TypeScript types for Quran data structures
  - `src/components/MushafSvgPage.tsx` — SVG ligature Mushaf renderer with word-click highlighting
  - `src/components/MushafPage.tsx` — legacy text-based Mushaf (kept, not used as default)
  - `src/components/SurahHeader.tsx` — surah name header with bismillah
  - `public/quran-audio-data.json` — word-level audio timestamps (sourced from attached_assets)

### `artifacts/api-server` — Express API Server
- **Route**: `/api`
- **Stack**: Express 5 + Drizzle ORM + PostgreSQL
- **Key routes**:
  - `GET /api/healthz` — health check
  - `GET /api/mushaf-svg/:page` — serves SVG for Mushaf pages 1–604, extracted on-demand from ZIP with in-memory caching

## SVG Mushaf Architecture

- ZIP file: `attached_assets/ligature-basd-svg_1776916961528.zip` (~80MB, 604 SVG files)
- API server opens ZIP fd at startup, parses central directory for all 604 entries, extracts SVGs on-demand with `readSync` + `inflateRawSync`, caches strings in memory
- Each SVG word group: `<g id="md-word-NNN" data-surah="..." data-aya="..." data-word-index-in-ayah="N" data-type="text">`
- Word highlighting: CSS class `md-word-active` toggled via React event delegation; CSS in `index.css` targets `.mushaf-svg-container g[data-word-index-in-ayah].md-word-active path[data-type="text"]`

## Audio Data Format

The `quran-audio-data.json` file is keyed by `"{surah}:{ayah}"` strings. Each entry has:
```json
{
  "surah_number": 1,
  "ayah_number": 1,
  "audio_url": "https://audio-cdn.tarteel.ai/quran/alafasy/001001.mp3",
  "duration": null,
  "segments": [[1, 0, 560], [2, 760, 1200], ...]
}
```
Segment format: `[word_index, start_ms, end_ms]` (word_index starts at 1).

## Word Span DOM Convention

Every Arabic word is rendered as:
```html
<span id="{surah}:{ayah}:{word_index}" class="quran-word ...">word</span>
```
e.g. `id="1:1:1"` maps directly to `segments[0]` in the audio data for ayah 1:1.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
