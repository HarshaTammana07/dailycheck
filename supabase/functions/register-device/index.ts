import { adminClient, requireUser } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const { error, user } = await requireUser(req);
  if (error || !user) return jsonResponse({ error }, 401);

  const body = await req.json().catch(() => ({}));
  const deviceIdHash = String(body.deviceIdHash ?? '');
  const deviceName = String(body.deviceName ?? 'Unknown device');
  const operatingSystem = String(body.operatingSystem ?? 'Unknown OS');
  const appVersion = String(body.appVersion ?? '0.0.0');
  const leaseHours = Number(Deno.env.get('OFFLINE_AUTH_LEASE_HOURS') ?? 24);

  const admin = adminClient();
  const { data, error: rpcError } = await admin.rpc('register_device_atomic', {
    p_user_id: user.id,
    p_device_id_hash: deviceIdHash,
    p_device_name: deviceName,
    p_operating_system: operatingSystem,
    p_app_version: appVersion,
    p_lease_hours: leaseHours
  });

  if (rpcError) return jsonResponse({ error: rpcError.message }, 400);
  return jsonResponse(data);
});
