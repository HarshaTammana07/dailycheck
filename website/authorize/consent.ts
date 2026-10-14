import { createClient, type OAuthAuthorizationDetails } from '@supabase/supabase-js';
if (window.top !== window.self) { document.body.textContent = 'Open this authorization page directly in your browser.'; throw new Error('Embedded authorization is not allowed.'); }
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const client = createClient(url, key, { auth: { storage: sessionStorage, storageKey: 'dailycheck-consent', persistSession: true, detectSessionInUrl: false } });
const id = new URL(location.href).searchParams.get('authorization_id');
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
let details: OAuthAuthorizationDetails | undefined;
let busy = false;
function errorMessage(error: unknown) { element('error').textContent = error instanceof Error ? error.message : 'The connection could not finish. Try again.'; element('error').hidden = false; }
function safeRedirect(value: string, registered?: string) {
  const target = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && loopback)) throw new Error('Unsupported authorization redirect.');
  if (registered && (target.origin !== new URL(registered).origin || target.pathname !== new URL(registered).pathname)) throw new Error('Authorization redirect does not match the registered client.');
  location.assign(target.href);
}
function setBusy(next: boolean) { busy = next; for (const button of document.querySelectorAll('button')) button.disabled = next; }
async function load() {
  details = undefined; element('error').hidden = true; element('consent').hidden = true; element('retry').hidden = true;
  if (!id || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) { element('status').textContent = 'Start the DailyCheck connection from ChatGPT to open a valid authorization request.'; return; }
  const { data } = await client.auth.getSession();
  if (!data.session) { element('login').hidden = false; element('logout').hidden = true; element('status').textContent = 'Sign in with your existing DailyCheck account.'; return; }
  element('login').hidden = true; element('logout').hidden = false;
  try {
    const { data: authorization, error } = await client.auth.oauth.getAuthorizationDetails(id);
    if (error || !authorization) throw error ?? new Error('Authorization request was not found.');
    if ('redirect_url' in authorization) { safeRedirect(authorization.redirect_url); return; }
    if (authorization.user.id !== data.session.user.id) throw new Error('The authorization account changed. Sign in again.');
    const account = await client.from('cloud_accounts').select('owner').maybeSingle();
    if (account.error || !account.data) throw new Error('Enable cloud sync in DailyCheck Settings first, then choose Try again here.');
    details = authorization;
    element('status').textContent = 'Review the requesting integration and choose its permissions.';
    element('client-name').textContent = `${authorization.client.name || 'Unnamed integration'} requests access`;
    element('account').textContent = `DailyCheck account: ${authorization.user.email}`;
    element('callback').textContent = `Registered callback: ${authorization.redirect_uri}`;
    element('scope').textContent = `Identity scopes requested: ${authorization.scope}`;
    element('consent').hidden = false;
  } catch (error) { errorMessage(error); element('retry').hidden = false; }
}
element<HTMLFormElement>('login').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; setBusy(true); element('error').hidden = true;
  try {
    const { error } = await client.auth.signInWithPassword({ email: element<HTMLInputElement>('email').value, password: element<HTMLInputElement>('password').value });
    if (error) throw error;
    element<HTMLInputElement>('password').value = ''; await load();
  } catch (error) { errorMessage(error); } finally { setBusy(false); }
});
element('approve').addEventListener('click', async () => {
  if (busy || !details || !id) return; setBusy(true); element('error').hidden = true;
  let granted = false;
  const currentDetails = details;
  let previous: { can_create: boolean; revoked_at: string | null } | null = null;
  try {
    const saved = await client.from('cloud_grants').select('can_create, revoked_at').eq('client_id', currentDetails.client.id).maybeSingle();
    if (saved.error) throw saved.error;
    previous = saved.data;
    const { data } = await client.auth.getSession();
    if (data.session?.user.id !== currentDetails.user.id) throw new Error('Account changed. Sign in again.');
    const create = (document.querySelector<HTMLInputElement>('input[name="permission"]:checked')?.value === 'create');
    const { error } = await client.rpc('cloud_set_grant', { p_client_id: currentDetails.client.id, p_can_create: create, p_revoke: false });
    if (error) throw error; granted = true;
    const approved = await client.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true });
    if (approved.error || !approved.data) throw approved.error ?? new Error('Authorization could not be approved.');
    safeRedirect(approved.data.redirect_url, currentDetails.redirect_uri);
  } catch (error) {
    if (granted) await client.rpc('cloud_set_grant', { p_client_id: currentDetails.client.id, p_can_create: previous?.can_create ?? false, p_revoke: !previous || Boolean(previous.revoked_at) });
    errorMessage(error);
  } finally { setBusy(false); }
});
element('deny').addEventListener('click', async () => {
  if (busy || !id) return; setBusy(true);
  try { const denied = await client.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    if (denied.error || !denied.data) throw denied.error ?? new Error('Could not finish denial.');
    safeRedirect(denied.data.redirect_url, details?.redirect_uri);
  } catch (error) { errorMessage(error); } finally { setBusy(false); }
});
element('logout').addEventListener('click', async () => { if (busy) return; await client.auth.signOut({ scope: 'local' }); await load(); });
element('retry').addEventListener('click', () => { if (!busy) void load(); });
void load().catch(errorMessage);
