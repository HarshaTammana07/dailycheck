import { adminClient, requireUser } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const { error, user } = await requireUser(req);
  if (error || !user) return jsonResponse({ error }, 401);

  const { data, error: dbError } = await adminClient()
    .from('registered_devices')
    .select('id, device_id_hash, device_name, operating_system, app_version, registered_at, last_seen_at, revoked_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('last_seen_at', { ascending: false });

  if (dbError) return jsonResponse({ error: dbError.message }, 400);
  return jsonResponse({ devices: data ?? [] });
});
