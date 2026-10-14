# CI/CD

The project includes two GitHub Actions workflows.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests:

- `npm ci`
- Type checking
- Unit tests
- Renderer and Electron build
- Website link safety check

## Manual Release

`.github/workflows/release.yml` is manually triggered. It accepts:

- `version`: semantic version to package.
- `publish`: boolean. Defaults to false.

When `publish` is false, the workflow builds artifacts and uploads them to the workflow run. When true, `electron-builder` publishes to GitHub Releases using `GH_TOKEN`.

## Why Manual First

Manual release keeps the first learning path explicit. You should verify signing secrets, app identity, artifact names, update metadata, and release notes before publishing real public installers.
