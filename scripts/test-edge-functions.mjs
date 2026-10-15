import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['register-device', 'list-devices', 'revoke-device', 'validate-device'];
const auth = await readFile(resolve(root, 'supabase/functions/_shared/auth.ts'), 'utf8');
const cors = await readFile(resolve(root, 'supabase/functions/_shared/cors.ts'), 'utf8');
const verifiedUser = { id: 'verified-user', email_confirmed_at: '2026-10-14T00:00:00Z' };

async function loadHandler(name, user = verifiedUser, legacy = false, oauth = false) {
  const original = await readFile(resolve(root, `supabase/functions/${name}/index.ts`), 'utf8');
  const source = auth + '\n' + cors + '\n' + original.replace(/^import .* from '\.\.\/_shared\/(?:auth|cors)\.ts';\r?\n/gm, '');
  const calls = [];
  const env = legacy ? {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'legacy-public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-server-test-key'
  } : {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'public-test-key' }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'server-test-key' })
  };
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { ...(oauth ? { client_id: 'oauth-client' } : {}) } }, error: null }), getUser: async (token) => {
      calls.push(['getUser', token]);
      return token === 'valid-user-token'
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: 'Invalid session' } };
    } },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return { data: { authorized: true, devices: [], authorizedUntil: '2026-10-15T00:00:00Z' }, error: null };
    },
    from(table) {
      calls.push(['from', table]);
      const chain = {};
      for (const method of ['select', 'eq', 'is', 'order', 'update']) {
        chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
      }
      chain.maybeSingle = async () => ({ data: { id: 'device-row' }, error: null });
      chain.then = (onFulfilled, onRejected) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      return chain;
    }
  };
  let handler;
  const context = vm.createContext({
    exports: {}, Response, Date, console,
    require: () => ({ createClient: (url, key) => { calls.push(['createClient', url, key]); return client; } }),
    Deno: { env: { get: (key) => env[key] }, serve: (fn) => { handler = fn; } }
  });
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
    fileName: `${name}.ts`
  });
  const errors = compiled.diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: (name) => name, getCurrentDirectory: () => root, getNewLine: () => '\n'
  }));
  vm.runInContext(compiled.outputText, context);
  assert.equal(typeof handler, 'function');
  return { handler, calls };
}

function request(authorization, body = {}) {
  return new Request('https://test.supabase.co/functions/v1/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body)
  });
}

for (const name of names) {
  test(`${name} rejects OAuth integration tokens before device admin access`, async () => {
    const { handler, calls } = await loadHandler(name, verifiedUser, false, true);
    const response = await handler(request('Bearer valid-user-token'));
    assert.equal(response.status, 401);
    assert(!calls.some(call => call[0] === 'rpc' || call[0] === 'from'));
  });
  test(`${name} rejects missing or invalid credentials before admin access`, async () => {
    for (const authorization of [undefined, 'public-test-key', 'Bearer invalid-token']) {
      const { handler, calls } = await loadHandler(name);
      const response = await handler(request(authorization));
      assert.equal(response.status, 401);
      assert.ok(!calls.some((call) => call[0] === 'rpc' || call[0] === 'from'));
      assert.ok(!calls.some((call) => call[0] === 'createClient' && call[2] === 'server-test-key'));
    }
  });

  test(`${name} rejects an unverified email`, async () => {
    const { handler, calls } = await loadHandler(name, { id: 'unverified-user' });
    const response = await handler(request('Bearer valid-user-token'));
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /Verify your email/);
    assert.ok(!calls.some((call) => call[0] === 'rpc' || call[0] === 'from'));
  });

  test(`${name} takes identity from the verified session`, async () => {
    const { handler, calls } = await loadHandler(name);
    const response = await handler(request('Bearer valid-user-token', {
      userId: 'attacker-chosen-user', id: 'device-row', deviceIdHash: 'a'.repeat(64),
      deviceName: 'Test computer', operatingSystem: 'Windows', appVersion: '1.0.0'
    }));
    assert.equal(response.status, 200);
    assert.ok(calls.some((call) => call[0] === 'getUser' && call[1] === 'valid-user-token'));
    if (name === 'register-device') {
      const rpcCall = calls.find((call) => call[0] === 'rpc');
      assert.equal(rpcCall[2].p_user_id, verifiedUser.id);
    } else {
      assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === verifiedUser.id));
    }
  });
}

test('legacy injected keys remain supported', async () => {
  const { handler, calls } = await loadHandler('register-device', verifiedUser, true);
  const response = await handler(request('Bearer valid-user-token', { deviceIdHash: 'a'.repeat(64) }));
  assert.equal(response.status, 200);
  assert.ok(calls.some((call) => call[0] === 'createClient' && call[2] === 'legacy-server-test-key'));
});
