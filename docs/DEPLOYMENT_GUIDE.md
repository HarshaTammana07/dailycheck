# Deployment Guide

This guide walks through the first public launch.

## 1. Local Development

```bash
npm install
copy .env.example .env
npm run dev
```

Fill `.env` with Supabase settings first.

## 2. Supabase Setup

1. Create a Supabase project.
2. Enable email/password authentication.
3. Apply `supabase/migrations/0001_device_registry.sql`.
   Then apply `supabase/migrations/0002_restrict_device_rpc_permissions.sql`.
   The second migration removes default public access to the privileged database functions.
4. Deploy Edge Functions:
   - `register-device`
   - `list-devices`
   - `revoke-device`
   - `validate-device`
5. Set Edge Function secrets:
   - `OFFLINE_AUTH_LEASE_HOURS`

Supabase injects `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS` into hosted Edge Functions automatically.

For dashboard deployment, first run `node scripts/prepare-dashboard-functions.mjs`.
Paste each generated `work/dashboard-functions/<name>.ts` into the dashboard's `index.ts`,
set the function name to `<name>`, and deploy. These files include the shared helpers;
the original `index.ts` files alone are not complete dashboard uploads.
For the dashboard toggle labeled Verify JWT with legacy secret, turn it off.
Every handler checks the user token with Supabase Auth getUser(token)
and requires a verified email before accessing device data.

## 3. First Installer

On Windows:

```bash
npm run dist:win
```

On macOS:

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
```

Development installers may be unsigned. Production installers should be signed.

## 4. First Release

See `GITHUB_SETUP.md` for the configured repository, public build variables, workflow
inputs, development versus production signing, and the first installed update test.
The release workflow publishes only after all requested platform builds succeed.
Pages reads actual release assets; links do not need to be invented or updated by hand.

## 5. Update Test

1. Install `1.0.0`.
2. Log in and create tasks.
3. Bump version to `1.0.1`.
4. Publish signed artifacts.
5. Relaunch `1.0.0`.
6. Use the update prompt to install `1.0.1`.
7. Confirm tasks and session survive.
