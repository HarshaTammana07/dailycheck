import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseAssets } from './release-assets.mjs';
const repository = 'example/dailycheck';
const windows = { name: 'DailyCheck-1.0.0-win-x64.exe', size: 100, browser_download_url: 'https://github.com/example/dailycheck/releases/download/v1.0.0/DailyCheck-1.0.0-win-x64.exe' };
test('download links stay disabled before a release', () => assert.deepEqual(releaseAssets(repository, null).artifacts, {}));
test('draft and prerelease assets are not advertised', () => {
  for (const flag of ['draft', 'prerelease']) assert.deepEqual(releaseAssets(repository, { [flag]: true, assets: [windows] }).artifacts, {});
});
test('only existing artifacts matching the release version are enabled', () => {
  const result = releaseAssets(repository, { tag_name: 'v1.0.0', assets: [windows], body: 'Release type: development' });
  assert.deepEqual(result.artifacts, { 'windows-x64': windows.browser_download_url });
  assert.equal(result.mode, 'development');
});
test('foreign asset URLs are rejected', () => assert.throws(() => releaseAssets(repository, { tag_name: 'v1.0.0', assets: [{ ...windows, browser_download_url: 'https://malicious.example/app.exe' }] })));
test('empty uploads are not advertised', () => assert.deepEqual(releaseAssets(repository, { tag_name: 'v1.0.0', assets: [{ ...windows, size: 0 }] }).artifacts, {}));
test('a malformed release version is rejected', () => assert.throws(() => releaseAssets(repository, { tag_name: 'not-a-version' })));
