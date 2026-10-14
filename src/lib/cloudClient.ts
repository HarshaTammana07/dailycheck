import { supabase } from './supabase';
import { SyncEngine, type CloudTransport } from './cloudSync';
import type { OutboxOperation } from './cloudTypes';

async function rpc<T>(name: string, args: Record<string, unknown>, signal: AbortSignal) {
  const { data, error } = await supabase.rpc(name, args).abortSignal(signal);
  if (error) throw new Error(error.code === 'PGRST202' ? 'The cloud backend has not been deployed yet.' : error.message);
  return data as T;
}

export async function createCloudTransport(accountId: string): Promise<CloudTransport> {
  const device = await window.dailycheck?.device?.getInfo();
  if (!device) throw new Error('Cloud sync requires an authorized DailyCheck desktop installation.');
  async function guard() {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== accountId) throw new Error('Your account changed. Open DailyCheck again.');
  }
  return {
    async configure(enabled, timezone, signal) {
      await guard();
      await rpc('cloud_configure', { p_enabled: enabled, p_timezone: timezone, p_device_hash: device.deviceIdHash }, signal);
    },
    async apply(operation: OutboxOperation, signal) {
      await guard();
      return rpc('cloud_apply', { p_operation_id: operation.operationId, p_kind: operation.kind, p_id: operation.entityId,
        p_payload: operation.payload, p_expected_revision: operation.expectedRevision, p_deleted: operation.deleted, p_device_hash: device.deviceIdHash }, signal);
    },
    async pull(after, snapshot, signal) {
      await guard();
      return rpc('cloud_pull', { p_after: after, p_snapshot: snapshot, p_device_hash: device.deviceIdHash }, signal);
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
