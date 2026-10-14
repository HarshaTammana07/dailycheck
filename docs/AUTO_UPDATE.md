# Auto Update

The global update dialog replays the latest main-process update state, offers release
notes and Download Update, shows progress, and offers Restart and Install only after
the download completes. Automatic installation on app exit is disabled.

Development Windows releases are unsigned and use the updater's SHA-512 integrity
check over HTTPS. This is not publisher identity verification. Production releases
require operating-system signing. Unsigned macOS automatic updates are disabled.
The first public 1.0.0 baseline must be installed manually because the earlier local
installer was created with placeholder hosting. See `GITHUB_SETUP.md` for the test.

DailyCheck uses `electron-updater` with GitHub Releases.

## Runtime Behavior

1. Packaged app launches.
2. Main process calls `autoUpdater.checkForUpdates()`.
3. GitHub Release metadata is compared with the installed version.
4. Renderer receives update events through the preload bridge.
5. User can download the update or postpone.
6. After download, the app can restart and install.

The dev server build skips update checks because it has no packaged update metadata.

## Verification

Signed updates are the practical security boundary. Configure Windows and macOS signing before public auto-updates. Never ask users to install unknown update packages.

## Test Scenario

1. Build and install version `1.0.0`.
2. Create tasks and log in.
3. Change `package.json` to `1.0.1`.
4. Publish a signed GitHub Release.
5. Relaunch `1.0.0`.
6. Confirm it detects `1.0.1`, downloads, installs, and preserves IndexedDB plus the Supabase session.

Do not mark this test as passed until it has been performed on actual packaged builds.
