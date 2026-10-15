import { supabase } from './supabase';
import { SyncEngine, type CloudTransport } from './cloudSync';
import type { OutboxOperation } from './cloudTypes';

async function accountSession(accountId: string) {
  const session = await supabase.auth.getSession();
  if (session.error || session.data.session?.user.id !== accountId) throw new Error('Your account changed. Open DailyCheck again.');
  return session.data.session;
}

export async function accountRpc<T>(accountId: string, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const session = await accountSession(accountId);
  // Bind the checked session to this request. A later login must never change its owner.
  const request = supabase.rpc(name, args).setHeader('Authorization', `Bearer ${session.access_token}`);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw new Error(error.code === 'PGRST202' ? 'The cloud backend has not been deployed yet.' : error.message);
  return data as T;
}

export async function revokeAccountOAuthGrant(accountId: string, clientId: string) {
  const session = await accountSession(accountId);
  // The SDK's revokeGrant reads the mutable shared session internally. Bind this
  // public Auth API request too, after the application grant has been revoked.
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user/oauth/grants?client_id=${encodeURIComponent(clientId)}`, {
    method: 'DELETE', signal: AbortSignal.timeout(30_000), headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`
    }
  });
  if (!response.ok) throw new Error('DailyCheck access is blocked, but OAuth token revocation could not finish. Try reconnecting only when you intend to restore access.');
}

export async function createCloudTransport(accountId: string): Promise<CloudTransport> {
  const device = await window.dailycheck?.device?.getInfo();
  if (!device) throw new Error('Cloud sync requires an authorized DailyCheck desktop installation.');
  return {
    async configure(enabled, timezone, signal) {
      await accountRpc(accountId, 'cloud_configure', { p_enabled: enabled, p_timezone: timezone, p_device_hash: device.deviceIdHash }, signal);
    },
    async apply(operation: OutboxOperation, signal) {
      return accountRpc(accountId, 'cloud_apply', { p_operation_id: operation.operationId, p_kind: operation.kind, p_id: operation.entityId,
        p_payload: operation.payload, p_expected_revision: operation.expectedRevision, p_deleted: operation.deleted, p_device_hash: device.deviceIdHash }, signal);
    },
    async pull(after, snapshot, signal) {
      return accountRpc(accountId, 'cloud_pull', { p_after: after, p_snapshot: snapshot, p_device_hash: device.deviceIdHash }, signal);
    }
  };
}

export async function startCloudSync(accountId: string, onChanged: () => void) {
  const engine = new SyncEngine(accountId, await createCloudTransport(accountId));
  let failures = 0;
  let timer: ReturnType<typeof setTimeout>;
  let ended = false;
  const tick = async () => {
    if (ended) return;
    clearTimeout(timer);
    try { await engine.run(); failures = 0; if (!ended) onChanged(); }
    catch { failures++; }
    if (!ended) timer = setTimeout(tick, Math.min(300_000, 20_000 * 2 ** Math.min(failures, 4)) + Math.random() * 1000);
  };
  const wake = () => { if (!ended) { clearTimeout(timer); timer = setTimeout(tick, 250); } };
  window.addEventListener('online', wake);
  window.addEventListener('focus', wake);
  void tick();
  return () => { ended = true; clearTimeout(timer); engine.stop(); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); };
}
