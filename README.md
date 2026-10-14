# DailyCheck

DailyCheck is a small local-first desktop checklist app built to teach the complete lifecycle of a real desktop product: Electron development, Supabase authentication, two-device authorization, IndexedDB persistence, installers, GitHub Releases, automatic updates, and a simple download website.

## What Works Locally

- Electron + React + TypeScript + Vite app shell.
- Daily recurring tasks with selected weekdays.
- Month view with per-day completion percentage.
- Selected-day checklist with historical completion records.
- IndexedDB persistence through Dexie.
- Supabase Auth integration using secure Electron storage.
- Supabase SQL migration and Edge Functions for two-device authorization.
- electron-builder and electron-updater configuration.
- Static download website source.
- CI and manual release workflows.
- Unit tests for recurrence, progress, and offline lease logic.

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Fill `.env` with a real Supabase project URL and publishable key before logging in.

## Main Commands

```bash
npm run dev
npm test
npm run test:edge
npm run test:release
npm run build
npm run pack:dir
npm run dist:win
npm run dist:mac:arm64
npm run website:check
```

## Supabase

Apply `supabase/migrations/0001_device_registry.sql` and `0002_restrict_device_rpc_permissions.sql`, deploy the four Edge Functions, and set these Edge Function secrets:

- `OFFLINE_AUTH_LEASE_HOURS`

Supabase injects `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS` into hosted Edge Functions automatically.

## Docs

Start with `docs/DEPLOYMENT_GUIDE.md` and `docs/GITHUB_SETUP.md`, then read the focused lifecycle documents in `docs/`.

## Cloud and MCP preview

The `feat/cloud-mcp` branch adds optional cloud task synchronization and an OAuth-protected MCP server. The public stable download remains 1.0.2. Deployment and a real OAuth connection must be verified before publishing this feature as a stable release. See [cloud deployment and acceptance checks](docs/CLOUD_MCP.md).

Run `npm run test:cloud`, `npm run test:mcp`, and `npm run build:consent` in addition to the existing checks. No private Supabase key belongs in the renderer, website, or repository.

The configured release repository is `HarshaTammana07/dailycheck`. GitHub builds
need the public Supabase URL and publishable key in repository Actions variables.
Development releases are unsigned. Production releases require signing secrets;
unsigned macOS automatic updates are disabled. The Pages workflow enables download
buttons only for real published release assets.
