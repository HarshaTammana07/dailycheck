import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ session: null as any, rpc: vi.fn(), headers: {} as Record<string, string> }));
vi.mock('../lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: mock.session }, error: null }) }, rpc: mock.rpc
} }));
import { accountRpc, revokeAccountOAuthGrant } from '../lib/cloudClient';
beforeEach(() => {
  vi.unstubAllGlobals();
  mock.session = { user: { id: 'account-a' }, access_token: 'token-a' }; mock.headers = {}; mock.rpc.mockReset();
  mock.rpc.mockImplementation(() => ({
    setHeader(name: string, value: string) { mock.headers[name] = value; return this; },
    abortSignal() { return this; },
    then(resolve: (value: unknown) => void) {
      // Reproduce another login between the guard and the transport reading auth.
      mock.session = { user: { id: 'account-b' }, access_token: 'token-b' };
      resolve({ data: { usedAuthorization: mock.headers.Authorization ?? `Bearer ${mock.session.access_token}` }, error: null });
    }
  }));
});
it('binds the checked account token even if another login occurs before transmission', async () => {
  const result = await accountRpc<{ usedAuthorization: string }>('account-a', 'cloud_apply', {});
  expect(result.usedAuthorization).toBe('Bearer token-a');
});
it('rejects a stale account before creating any database request', async () => {
  await expect(accountRpc('account-b', 'cloud_apply', {})).rejects.toThrow('account changed');
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('OAuth revocation also binds the intended account rather than a later login', async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    mock.session = { user: { id: 'account-b' }, access_token: 'token-b' };
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', fetch);
  await revokeAccountOAuthGrant('account-a', 'client-id');
  expect(fetch).toHaveBeenCalledOnce();
});
