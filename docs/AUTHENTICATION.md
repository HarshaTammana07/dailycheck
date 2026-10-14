# Authentication

DailyCheck uses Supabase email and password authentication through `@supabase/supabase-js`.

## Flow

1. The user signs up or logs in from the React renderer.
2. Supabase returns a session with access and refresh tokens.
3. The Supabase client persists the session through a custom storage adapter.
4. In Electron, that adapter calls the preload bridge.
5. The main process stores session data with Electron `safeStorage` when the OS supports encryption.

The desktop app never stores passwords locally and never embeds a service-role key.

## Email Verification And Reset Links

The app registers `dailycheck://` as a desktop protocol and forwards callback URLs from the Electron main process to the renderer through the preload bridge. Configure these redirect URLs in the Supabase dashboard:

- `dailycheck://auth/callback`
- `dailycheck://auth/reset-password`

The renderer exchanges the returned PKCE `code` with Supabase. A production password-reset screen should also prompt the user for a new password after the reset session is established.

## Session Refresh

Supabase handles refresh token rotation through `autoRefreshToken: true`. If refresh fails because the user revoked the session or lost connectivity, the UI reports the Supabase error and asks the user to sign in again.

## Required Configuration

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Supabase Auth enabled for email/password.
- Email redirect URLs configured for development and production.
