import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseEnvironment } from './release-environment.mjs';

test('unsigned builds omit empty GitHub signing secrets that resolve to a directory', () => {
  const input = { CSC_LINK: '', CSC_KEY_PASSWORD: '', APPLE_ID: '', VITE_SUPABASE_URL: 'https://example.supabase.co' };
  const result = releaseEnvironment(input, 'development');
  assert.equal(Object.hasOwn(result, 'CSC_LINK'), false);
  assert.equal(Object.hasOwn(result, 'CSC_KEY_PASSWORD'), false);
  assert.equal(Object.hasOwn(result, 'APPLE_ID'), false);
  assert.equal(result.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(result.VITE_SUPABASE_URL, input.VITE_SUPABASE_URL);
  assert.equal(input.CSC_LINK, '', 'The caller environment must not be mutated');
});

test('development mode excludes configured credentials to keep builds unsigned', () => {
  const result = releaseEnvironment({ CSC_LINK: 'certificate.p12', WIN_CSC_LINK: 'certificate.pfx', APPLE_API_KEY: 'notarization-key-file' }, 'development');
  assert.equal(Object.hasOwn(result, 'CSC_LINK'), false);
  assert.equal(Object.hasOwn(result, 'WIN_CSC_LINK'), false);
  assert.equal(Object.hasOwn(result, 'APPLE_API_KEY'), false);
});

test('production mode preserves certificate and notarization settings', () => {
  const input = { CSC_LINK: 'certificate.p12', CSC_KEY_PASSWORD: 'test-password-placeholder', APPLE_ID: 'developer@example.com' };
  assert.deepEqual(releaseEnvironment(input, 'production'), input);
});
