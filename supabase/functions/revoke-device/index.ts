import { adminClient, requireUser } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const { error, user } = await requireUser(req);
  if (error || !user) return jsonResponse({ error }, 401);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return jsonResponse({ error: 'Device id is required.' }, 400);

  const { error: dbError } = await adminClient()
    .from('registered_devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if (dbError) return jsonResponse({ error: dbError.message }, 400);
  return jsonResponse({ ok: true });
});
