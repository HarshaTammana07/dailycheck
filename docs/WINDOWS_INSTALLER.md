# Windows Installer

Windows packaging uses `electron-builder` with the NSIS target.

## Build

```bash
npm run dist:win
```

Expected artifact shape:

```text
release/DailyCheck-1.0.0-win-x64.exe
```

The installer adds DailyCheck to the Start menu and offers a desktop shortcut.

## Code Signing

Unsigned Windows installers can run during development, but users may see SmartScreen warnings. For public distribution, buy or obtain a Windows code-signing certificate and configure:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

In GitHub Actions these values live in repository secrets.

## User Install Path

1. User visits the static download site in Chrome or another browser.
2. User downloads the Windows installer from a GitHub Release asset.
3. User runs the installer.
4. DailyCheck opens as a normal desktop app and checks for updates in packaged builds.
