import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { withOAuthProtectedResource } from 'npm:@supabase/server@1.9.2';
import { AuthorizationError, createDailyCheckHandler, type Context } from './server.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const issuer = `${url}/auth/v1`;
const resource = `${url}/functions/v1/dailycheck-mcp`;
function publicKey() {
  const dictionary = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (dictionary) return JSON.parse(dictionary).default ?? Object.values(JSON.parse(dictionary))[0];
  return Deno.env.get('SUPABASE_ANON_KEY');
}
async function authorize(request: Request): Promise<Context> {
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new AuthorizationError('Connect your DailyCheck account to use these tools.');
  const client = createClient(url, publicKey(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: claimsError } = await client.auth.getClaims(token);
  const claims = verified?.claims;
  const audiences = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  if (claimsError || claims?.iss !== issuer || !audiences.includes('authenticated') || !claims?.client_id) {
    throw new AuthorizationError('A valid DailyCheck OAuth connection is required.');
  }
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) throw new AuthorizationError('Sign in with your verified DailyCheck account.');
  const { data: account, error: accountError } = await client.from('cloud_accounts').select('timezone, revision').maybeSingle();
  if (accountError || !account) throw new Error('Cloud access is disabled or this integration was revoked. Enable cloud sync and approve this integration.');
  return { user: { id: data.user.id, email: data.user.email }, timezone: account.timezone, revision: account.revision,
    rpc: async <T>(name: string, args: Record<string, unknown>) => {
      const { data, error } = await client.rpc(name, args);
      if (error) throw new Error(error.message);
      return data as T;
    } };
}
const handler = createDailyCheckHandler(authorize, resource);
Deno.serve(withOAuthProtectedResource({ resourceServer: resource, authorizationServer: issuer }, handler));
