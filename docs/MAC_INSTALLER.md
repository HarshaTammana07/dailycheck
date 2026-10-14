# macOS Installer

macOS packaging uses `electron-builder` with the DMG target.

## Build

Run this on macOS:

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
```

Expected artifact shape:

```text
release/DailyCheck-1.0.0-mac-arm64.dmg
release/DailyCheck-1.0.0-mac-x64.dmg
```

## Installing A DMG

The user downloads the DMG, opens it, then drags DailyCheck into the Applications folder.

## Signing And Notarization

For public distribution outside the Mac App Store, configure Developer ID signing and notarization. Required GitHub secrets usually include:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Gatekeeper may block unsigned or unnotarized builds. Development builds can be tested locally, but do not present them as production-ready releases.
