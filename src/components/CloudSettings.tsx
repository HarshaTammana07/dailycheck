import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { Cloud, CloudOff, RefreshCw, Unplug } from 'lucide-react';
import { db } from '../lib/db';
import type { OutboxOperation, SyncState } from '../lib/cloudTypes';
import { createCloudTransport } from '../lib/cloudClient';
import { enableLocalSync, resolveConflict, SyncEngine } from '../lib/cloudSync';
import { supabase } from '../lib/supabase';

export default function CloudSettings({ accountId, onChanged }: { accountId: string; onChanged: () => void }) {
  const [state, setState] = useState<SyncState>();
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState<OutboxOperation[]>([]);
  const [grants, setGrants] = useState<{ client_id: string; can_create: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dailycheck-mcp`;
  useEffect(() => {
    const subscription = liveQuery(async () => ({ state: await db.syncStates.get(accountId),
      queue: await db.outbox.where('accountId').equals(accountId).toArray() })).subscribe({ next: value => {
        setState(value.state); setPending(value.queue.length); setConflicts(value.queue.filter(row => row.status === 'conflict'));
      }, error: () => setError('Could not read synchronization status.') });
    let mounted = true;
    void supabase.from('cloud_grants').select('client_id, can_create').is('revoked_at', null).then(({ data }) => { if (mounted) setGrants(data ?? []); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [accountId]);
  async function act(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Cloud operation could not finish.'); }
    finally { setBusy(false); }
  }
  async function configure(enabled: boolean) {
    const timezone = state?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (enabled) await enableLocalSync(accountId, timezone);
    else await db.syncStates.update(accountId, { enabled: false, configurationPending: true,
      configurationVersion: (state?.configurationVersion ?? 0) + 1, error: undefined });
    await new SyncEngine(accountId, await createCloudTransport(accountId)).run();
  }
  async function revoke(clientId: string) {
    const { error } = await supabase.rpc('cloud_set_grant', { p_client_id: clientId, p_can_create: false, p_revoke: true });
    if (error) throw error;
    setGrants(current => current.filter(grant => grant.client_id !== clientId));
    const revoked = await supabase.auth.oauth.revokeGrant({ clientId });
    if (revoked.error) throw new Error('DailyCheck access is blocked, but OAuth token revocation could not finish. Try reconnecting only when you intend to restore access.');
  }
  async function changePermission(clientId: string, canCreate: boolean) {
    const { error } = await supabase.rpc('cloud_set_grant', { p_client_id: clientId, p_can_create: canCreate, p_revoke: false });
    if (error) throw error;
    setGrants(current => current.map(grant => grant.client_id === clientId ? { ...grant, can_create: canCreate } : grant));
  }
  return <section className="cloud-section">
    <h3><Cloud size={16} /> Cloud sync & ChatGPT</h3>
    <p className="muted">Optional. Sync tasks, notes, and completion history to your account so ChatGPT can access them while this computer is off.</p>
    {!state && <label className="consent-checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I want to upload my existing tasks and history to my Supabase account.</label>}
    <p aria-live="polite">{state?.enabled ? `${pending} pending changes${state.lastSyncedAt ? ` · Last synced ${new Date(state.lastSyncedAt).toLocaleString()}` : ''}` : state?.configurationPending ? 'Paused on this computer. Cloud access will be disabled when an online request succeeds.' : state ? 'Cloud access and synchronization are paused.' : 'Your tasks are currently local only.'}</p>
    {(error || state?.error) && <p className="notice" role="alert">{error || state?.error}</p>}
    <div className="button-row"><button className="secondary-button" disabled={busy || (!state && !consent)} onClick={() => void act(() => configure(!state?.enabled))}>
      {state?.enabled ? <CloudOff size={16} /> : <Cloud size={16} />}{state?.enabled ? 'Pause cloud access' : state ? 'Resume cloud sync' : 'Enable cloud sync'}
    </button>{state?.enabled && <button className="secondary-button" disabled={busy} onClick={() => void act(async () => { await new SyncEngine(accountId, await createCloudTransport(accountId)).run(); })}><RefreshCw size={16} />Sync now</button>}</div>
    {state && <><p className="muted cloud-help">In ChatGPT, add DailyCheck as a custom MCP server using this URL and OAuth, then sign in to this account.</p><code className="mcp-url">{mcpUrl}</code><p className="muted">ChatGPT sees uploaded cloud records. Offline changes appear after synchronization.</p></>}
    {conflicts.map(operation => <div className="sync-conflict" key={operation.operationId}><strong>A {operation.kind} changed on another device.</strong>
      <p>Choose cloud to discard this record’s queued local edits, or keep your local edits to retry against the current cloud version.</p><div className="button-row">
        <button className="secondary-button" disabled={busy} onClick={() => void act(() => resolveConflict(accountId, operation.sequence!, 'cloud'))}>Use cloud version</button>
        {operation.current && !operation.current.deleted && <button className="secondary-button" disabled={busy} onClick={() => void act(() => resolveConflict(accountId, operation.sequence!, 'local'))}>Keep local edits</button>}</div></div>)}
    {grants.map(grant => <div className="device-row" key={grant.client_id}><div><strong>Connected integration</strong><span>{grant.client_id} · {grant.can_create ? 'Read and create' : 'Read only'}</span>
      <button className="secondary-button" disabled={busy} onClick={() => void act(() => changePermission(grant.client_id, !grant.can_create))}>{grant.can_create ? 'Make read only' : 'Allow task creation'}</button></div>
      <button type="button" className="icon-button danger" aria-label="Disconnect integration" disabled={busy} onClick={() => void act(() => revoke(grant.client_id))}><Unplug size={16} /></button></div>)}
  </section>;
}
