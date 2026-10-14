# Local Storage

DailyCheck stores checklist data in IndexedDB through Dexie.

## Stored Locally

- Task ID, name, description, creation date, archive state.
- Recurrence rule with selected weekdays.
- Daily completion records.
- Completion timestamps.
- User preferences.
- Offline device authorization lease.

Each record includes the authenticated Supabase user ID as `accountId`. Logging out does not delete local data. Logging in as another account loads a separate local data set.

## Migrations

Dexie schema versions live in `src/lib/db.ts`. Version 2 adds the `deviceLeases` table. Future versions should add a new `this.version(n).stores(...)` entry and, when needed, a migration callback.

## Export And Import

The settings panel exports the current account's tasks, completions, and preferences as JSON. Import rewrites the account ID to the currently authenticated user so another local user cannot accidentally claim data under the previous account ID.

## Protection

IndexedDB itself is not encrypted by this sample. Supabase session tokens are stored through Electron `safeStorage` where possible. For stronger local task privacy, add application-level encryption and store the encryption key in an OS credential store or derive it from a user-controlled secret.
