# GitHub repository, releases, updates, and Pages

The configured destination is `HarshaTammana07/dailycheck`.
The download page will be published through the repository's GitHub Pages API and Actions workflow.
Use the URL returned by GitHub once deployment succeeds.

## Repository contents

Commit source, package-lock.json, SQL migrations, Edge Functions, documentation,
icons, and workflows. `.env`, credentials, generated installers, outputs, and work
folders are excluded from Git. Tasks, session tokens, and device IDs are local data;
they must never be uploaded to the repository.

## Repository variables

In Settings -> Secrets and variables -> Actions -> Variables configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

These are the public Supabase app values, not service-role credentials. The release
workflow uses them during the Vite build. Without them, it fails before publishing.

## Workflows

- CI runs TypeScript, app tests, mocked Edge Function authentication tests,
  release-link tests, the application build, and website checks.
- Desktop Release is manually dispatched. Its version must match package.json.
  Windows NSIS and macOS Intel/Apple Silicon packages build on their respective runners.
  macOS DMG and ZIP are built together so update metadata includes the architectures.
- Release publication runs only after every requested platform succeeds.
  Artifacts and update metadata are uploaded together, then Pages is explicitly dispatched.
- Download Website builds the static website from the latest published release.
  Missing installers remain disabled. Draft and prerelease assets are not advertised.

## Development releases

Select `release_mode=development`. Windows update downloads receive electron-updater's
SHA-512 integrity check and use HTTPS. This does not establish publisher identity.
Unsigned macOS automatic updates are disabled; a signed production build is required.
Do not describe development builds as production-signed applications.

## Production signing

For Windows set Actions secrets `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.
For macOS set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
Use a Developer ID Application certificate and notarization credentials.
The production workflow checks for the required secrets, forces code signing,
enables Windows publisher verification, and requests macOS notarization.
Set these through GitHub settings rather than pasting them into chat or source.

## First update experiment

1. Publish the configured 1.0.0 baseline, then a 1.0.1 maintenance release.
2. Install the **published 1.0.0 installer** first. The earlier local installer has
   placeholder update hosting and cannot discover this repository.
3. Open the app, check your existing tasks, and choose Later if an update is offered.
4. Use DailyCheck -> Check for Updates or Settings -> Check.
5. Choose Download Update, then Restart and Install after the download finishes.
6. Verify version 1.0.1, retained login, task history, and registered-device identity.

Release publication alone does not prove that the installed update works. Report the
actual installed-version and data-retention observations before marking this test passed.

## Manual CLI equivalents

```powershell
gh variable set VITE_SUPABASE_URL --repo HarshaTammana07/dailycheck --body "your-public-project-url"
gh variable set VITE_SUPABASE_PUBLISHABLE_KEY --repo HarshaTammana07/dailycheck --body "your-public-publishable-key"
gh workflow run release.yml --repo HarshaTammana07/dailycheck --ref main -f version=1.0.0 -f release_mode=development -f include_macos=true -f publish=true
gh workflow run pages.yml --repo HarshaTammana07/dailycheck --ref main
```

For each later release, bump and commit both package.json and package-lock.json,
push main, then dispatch Desktop Release with that version.

## Official references

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Electron auto-update, v26](https://www.electron.build/v26/docs/features/auto-update/)
