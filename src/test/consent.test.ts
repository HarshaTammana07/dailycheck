import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mock = vi.hoisted(() => ({ session: null as any, details: null as any, rpc: vi.fn(), approve: vi.fn(), deny: vi.fn(), existingGrant: null as any }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getSession: async () => ({ data: { session: mock.session } }), signInWithPassword: async () => ({ error: null }), signOut: async () => { mock.session = null; },
    oauth: { getAuthorizationDetails: async () => ({ data: mock.details, error: null }), approveAuthorization: mock.approve, denyAuthorization: mock.deny } },
  from: (name: string) => ({ select: () => ({ maybeSingle: async () => ({ data: name === 'cloud_accounts' ? { owner: 'owner' } : mock.existingGrant, error: null }),
    eq: () => ({ maybeSingle: async () => ({ data: mock.existingGrant, error: null }) }) }) }), rpc: mock.rpc
}) }));
beforeEach(() => {
  vi.resetModules(); vi.restoreAllMocks(); mock.rpc.mockReset(); mock.approve.mockReset(); mock.deny.mockReset();
  mock.rpc.mockResolvedValue({ error: null }); mock.approve.mockResolvedValue({ data: { redirect_url: 'https://chatgpt.com/oauth/callback?code=test' }, error: null });
  mock.deny.mockResolvedValue({ data: { redirect_url: 'https://chatgpt.com/oauth/callback?error=access_denied' }, error: null });
  mock.session = { user: { id: 'owner' } }; mock.existingGrant = null;
  mock.details = { authorization_id: 'request', client: { id: 'client-id', name: '<script>Untrusted client</script>' }, user: { id: 'owner', email: 'owner@example.com' }, redirect_uri: 'https://chatgpt.com/oauth/callback', scope: 'openid email' };
  const html = readFileSync('website/authorize/index.html', 'utf8');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  history.replaceState({}, '', '/authorize?authorization_id=request');
  vi.spyOn(location, 'assign').mockImplementation(() => {});
});
async function load() { await import('../../website/authorize/consent'); await vi.waitFor(() => expect(document.getElementById('consent')!.hidden).toBe(false)); }
it('renders client-supplied text safely and defaults to read-only consent', async () => {
  await load(); expect(document.getElementById('client-name')!.textContent).toContain('<script>');
  expect(document.getElementById('client-name')!.querySelector('script')).toBeNull();
  document.getElementById('approve')!.click();
  await vi.waitFor(() => expect(mock.approve).toHaveBeenCalled());
  expect(mock.rpc).toHaveBeenCalledWith('cloud_set_grant', expect.objectContaining({ p_can_create: false, p_revoke: false }));
});
it('requires an explicit create permission choice', async () => {
  await load(); (document.querySelector('input[value="create"]') as HTMLInputElement).checked = true;
  document.getElementById('approve')!.click();
  await vi.waitFor(() => expect(mock.approve).toHaveBeenCalled());
  expect(mock.rpc).toHaveBeenCalledWith('cloud_set_grant', expect.objectContaining({ p_can_create: true }));
});
it('denial never grants database access', async () => {
  await load(); document.getElementById('deny')!.click();
  await vi.waitFor(() => expect(mock.deny).toHaveBeenCalled()); expect(mock.rpc).not.toHaveBeenCalled();
});
it('failed OAuth approval rolls back newly granted application access', async () => {
  mock.approve.mockResolvedValue({ error: new Error('Expired authorization') });
  await load(); document.getElementById('approve')!.click();
  await vi.waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(2));
  expect(mock.rpc.mock.calls[1][1]).toMatchObject({ p_can_create: false, p_revoke: true });
  expect(location.assign).not.toHaveBeenCalled();
});
it('an invalid redirect is rejected and the prior grant is restored', async () => {
  mock.existingGrant = { can_create: false, revoked_at: null };
  mock.approve.mockResolvedValue({ data: { redirect_url: 'javascript:alert(1)' }, error: null });
  await load(); document.getElementById('approve')!.click();
  await vi.waitFor(() => expect(mock.rpc).toHaveBeenCalledTimes(2));
  expect(mock.rpc.mock.calls[1][1]).toMatchObject({ p_can_create: false, p_revoke: false });
  expect(location.assign).not.toHaveBeenCalled();
});
