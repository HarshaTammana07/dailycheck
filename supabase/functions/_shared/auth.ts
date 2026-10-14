import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';

function keyFromDictionary(envName: string) {
  const raw = Deno.env.get(envName);
  if (!raw) return undefined;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const keys = parsed as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default) return keys.default;
    return Object.values(keys).find((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return undefined;
  }
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = keyFromDictionary('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase admin environment variables.');
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

export async function requireUser(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const publishableKey = keyFromDictionary('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !publishableKey) throw new Error('Missing Supabase auth environment variables.');

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    return { error: 'A signed-in user Bearer token is required.', user: null };
  }

  const client = createClient(url, publishableKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { error: error?.message ?? 'Invalid session', user: null };
  }
  if (!data.user.email_confirmed_at) {
    return { error: 'Verify your email before authorizing a device.', user: null };
  }
  return { error: null, user: data.user };
}
