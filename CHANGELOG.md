# Changelog

## 1.2.0

- A predefined read-only task table inside ChatGPT through the existing DailyCheck MCP connection.
- Daily status and actual completion times in the account timezone, with date selection and Refresh.
- A self-contained MCP App component with light/dark appearance, empty/error states, and safe text rendering.
- Existing cloud authentication, integration permissions, task storage, and desktop data remain compatible. No database migration is required.

## 1.1.0

- Optional cloud synchronization for tasks, notes, and completion history, with explicit upload consent in Settings.
- OAuth connection for ChatGPT to read task metadata, checklists, history, and monthly progress, even while DailyCheck is closed.
- Task creation through MCP with a separate permission choice and duplicate-safe retries.
- Durable offline queues, account isolation, revision checks, deletion tombstones, and explicit conflict resolution.
- Controls to pause cloud access, change integration permissions, or disconnect an integration.
- Clear monthly occurrence totals that include future scheduled dates without labeling them overdue.
- Preserves existing local tasks and history. Cloud sync remains optional; theme and calendar preferences stay local.

## 1.0.2

- Redesigned dashboard with compact calendar cells, clearer monthly progress, and a dedicated daily checklist.
- Light, Dark, and System appearance options, remembered on this computer.
- Quick theme switch on the dashboard and login screen.
- Readable weekday controls, a Today shortcut, and layouts that adapt to smaller windows.
- Clearer update status and download/install actions in Settings.
- Existing local tasks, completion history, account data, and device registration use the same storage locations.

## 1.0.1

- Maintenance release for the first 1.0.0 to 1.0.1 update experiment.
- The About window and Settings display the installed version.
- Checklist data and authentication remain in the existing user data location.
- Installation and update retention must be checked on a real installed app.

## 1.0.0

- Electron desktop app with a monthly checklist and local task history.
- Supabase authentication and server-side device authorization.
- Windows installer and macOS build workflow.
- Update dialog with release notes, progress, and Restart and Install.
- GitHub Pages downloads generated from actual release assets.
- Development releases are unsigned; production releases require signing secrets.
