import { adminClient, requireUser } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const { error, user } = await requireUser(req);
  if (error || !user) return jsonResponse({ error }, 401);

  const body = await req.json().catch(() => ({}));
  const deviceIdHash = String(body.deviceIdHash ?? '');
  const leaseHours = Number(Deno.env.get('OFFLINE_AUTH_LEASE_HOURS') ?? 24);

  const admin = adminClient();
  const { data, error: dbError } = await admin
    .from('registered_devices')
    .select('id')
    .eq('user_id', user.id)
    .eq('device_id_hash', deviceIdHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (dbError) return jsonResponse({ error: dbError.message }, 400);
  if (!data) return jsonResponse({ authorized: false, reason: 'This device is not authorized.' }, 403);

  await admin.from('registered_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id);
  return jsonResponse({
    authorized: true,
    authorizedUntil: new Date(Date.now() + leaseHours * 60 * 60 * 1000).toISOString()
  });
});
