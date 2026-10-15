import { db, enqueueChange } from './db';
import { type CloudEntity, type OutboxOperation, type SyncState, versionKey } from './cloudTypes';
import type { CompletionRecord, TaskRecord } from '../types';
import { validateTask } from './importData';

export interface CloudTransport {
  configure(enabled: boolean, timezone: string, signal: AbortSignal): Promise<void>;
  apply(operation: OutboxOperation, signal: AbortSignal): Promise<{ status: 'applied'; entity: CloudEntity } | { status: 'conflict'; current: CloudEntity | null }>;
  pull(after: number, snapshot: number | null, signal: AbortSignal): Promise<{ changes: CloudEntity[]; next: number; snapshot: number; hasMore: boolean }>;
}
const activeAccounts = new Set<string>();

export async function enableLocalSync(accountId: string, timezone: string) {
  await db.transaction('rw', db.syncStates, db.outbox, db.tasks, db.completions, db.cloudVersions, async () => {
    const state = await db.syncStates.get(accountId);
    await db.syncStates.put({ ...state, accountId, timezone, checkpoint: state?.checkpoint ?? 0, enabled: true, error: undefined,
      configurationPending: true, configurationVersion: (state?.configurationVersion ?? 0) + 1 });
    if (state) return; // A paused queue resumes; it is never seeded twice.
    const tasks = await db.tasks.where('accountId').equals(accountId).toArray();
    const completions = await db.completions.where('accountId').equals(accountId).toArray();
    for (const task of tasks) validateTask(task);
    for (const task of tasks) {
      const normalized = { ...task, createdAt: task.createdAt.slice(0, 10), ...(task.archivedAt ? { archivedAt: task.archivedAt.slice(0, 10) } : {}) };
      await db.tasks.put(normalized);
      await enqueueChange(accountId, 'task', normalized);
    }
    for (const completion of completions) await enqueueChange(accountId, 'completion', completion);
  });
}

async function putCloudEntity(accountId: string, entity: CloudEntity) {
  const existing = entity.kind === 'task' ? await db.tasks.get(entity.id) : await db.completions.get(entity.id);
  if (existing && existing.accountId !== accountId) throw new Error('Local record ID belongs to another account. Export your data and resolve the collision.');
  if (entity.deleted) {
    if (entity.kind === 'task') {
      await db.tasks.delete(entity.id);
      await db.completions.where('[accountId+taskId+date]').between([accountId, entity.id, ''], [accountId, entity.id, '\uffff']).delete();
    } else await db.completions.delete(entity.id);
  } else if (entity.kind === 'task') {
    await db.tasks.put({ ...entity.payload, accountId } as TaskRecord);
  } else await db.completions.put({ ...entity.payload, accountId } as CompletionRecord);
}

export class SyncEngine {
  private running = false;
  private stopped = false;
  private controller = new AbortController();
  constructor(readonly accountId: string, private transport: CloudTransport) {}
  stop() { this.stopped = true; this.controller.abort(); }
  private assertActive() { if (this.stopped) throw new Error('Synchronization cancelled.'); }

  async run(): Promise<void> {
    if (this.stopped || this.running || activeAccounts.has(this.accountId)) return;
    this.running = true;
    activeAccounts.add(this.accountId);
    try {
      const configuration = await db.syncStates.get(this.accountId);
      if (!configuration) return;
      if (configuration.configurationPending) {
        await this.transport.configure(configuration.enabled, configuration.timezone, this.controller.signal);
        this.assertActive();
        await db.transaction('rw', db.syncStates, async () => {
          const latest = await db.syncStates.get(this.accountId);
          if (latest?.configurationVersion === configuration.configurationVersion) await db.syncStates.update(this.accountId, { configurationPending: false, error: undefined });
        });
      }
      const ready = await db.syncStates.get(this.accountId);
      if (!ready?.enabled || ready.configurationPending) return;
      // Never let a conflict on one entity silently overwrite another device's changes.
      const blocked = new Set<string>();
      for (let count = 0; count < 400; count++) {
        this.assertActive();
        if (!(await db.syncStates.get(this.accountId))?.enabled) return;
        const queue = await db.outbox.where('accountId').equals(this.accountId).sortBy('sequence');
        for (const row of queue.filter(row => row.status === 'conflict')) blocked.add(`${row.kind}:${row.entityId}`);
        const operation = queue.find(row => row.status === 'pending' && !blocked.has(`${row.kind}:${row.entityId}`));
        if (!operation) break;
        const result = await this.transport.apply(operation, this.controller.signal);
        this.assertActive();
        await db.transaction('rw', db.outbox, db.cloudVersions, async () => {
          this.assertActive();
          if (!(await db.outbox.get(operation.sequence!))) return;
          if (result.status === 'conflict') {
            await db.outbox.update(operation.sequence!, { status: 'conflict', current: result.current });
            blocked.add(`${operation.kind}:${operation.entityId}`);
          } else {
            await db.cloudVersions.put({ key: versionKey(this.accountId, result.entity.kind, result.entity.id), accountId: this.accountId,
              kind: result.entity.kind, entityId: result.entity.id, revision: result.entity.revision, deleted: result.entity.deleted });
            await db.outbox.delete(operation.sequence!);
            // Later local edits are causally after this acknowledged edit, not after unseen remote changes.
            await db.outbox.where('[accountId+kind+entityId]').equals([this.accountId, operation.kind, operation.entityId])
              .modify({ expectedRevision: result.entity.revision });
          }
        });
      }
      let state = (await db.syncStates.get(this.accountId))!;
      let snapshot: number | null = null;
      for (let page = 0; page < 1000; page++) {
        this.assertActive();
        const result = await this.transport.pull(state.checkpoint, snapshot, this.controller.signal);
        this.assertActive();
        if (!Number.isSafeInteger(result.next) || result.next < state.checkpoint || result.next > result.snapshot
          || (result.hasMore && result.next === state.checkpoint)) throw new Error('Invalid cloud checkpoint.');
        snapshot = result.snapshot;
        await db.transaction('rw', db.tasks, db.completions, db.cloudVersions, db.outbox, db.syncStates, async () => {
          this.assertActive();
          for (const entity of result.changes) {
            const pending = await db.outbox.where('[accountId+kind+entityId]').equals([this.accountId, entity.kind, entity.id]).count();
            const key = versionKey(this.accountId, entity.kind, entity.id);
            const previous = await db.cloudVersions.get(key);
            if (!pending && (!previous || previous.revision < entity.revision)) await putCloudEntity(this.accountId, entity);
            if (pending) await db.outbox.where('[accountId+kind+entityId]').equals([this.accountId, entity.kind, entity.id]).modify(row => {
              if (row.status === 'conflict' && (!row.current || row.current.revision <= entity.revision)) row.current = entity;
            });
            if (!previous || previous.revision < entity.revision) await db.cloudVersions.put({ key, accountId: this.accountId,
              kind: entity.kind, entityId: entity.id, revision: entity.revision, deleted: entity.deleted });
          }
          const latestState = (await db.syncStates.get(this.accountId))!;
          state = { ...latestState, checkpoint: Math.max(latestState.checkpoint, result.next), lastSyncedAt: new Date().toISOString(), error: undefined };
          await db.syncStates.put(state);
        });
        if (!result.hasMore) break;
      }
    } catch (error) {
      if (!this.stopped) await db.syncStates.update(this.accountId, { error: error instanceof Error ? error.message : 'Cloud synchronization failed.' });
      throw error;
    } finally { this.running = false; activeAccounts.delete(this.accountId); }
  }
}

export async function resolveConflict(accountId: string, sequence: number, choice: 'cloud' | 'local') {
  await db.transaction('rw', db.tasks, db.completions, db.outbox, db.cloudVersions, async () => {
    const operation = await db.outbox.get(sequence);
    if (!operation || operation.accountId !== accountId || operation.status !== 'conflict') throw new Error('Conflict is no longer available.');
    const related = db.outbox.where('[accountId+kind+entityId]').equals([accountId, operation.kind, operation.entityId]);
    if (choice === 'cloud') {
      // Explicitly choosing cloud discards this entity's queued local edits, never another entity's work.
      if (operation.current) await putCloudEntity(accountId, operation.current);
      else if (operation.kind === 'completion') await db.completions.delete(operation.entityId);
      else await db.tasks.delete(operation.entityId);
      if (operation.current) await db.cloudVersions.put({ key: versionKey(accountId, operation.kind, operation.entityId), accountId,
        kind: operation.kind, entityId: operation.entityId, revision: operation.current.revision, deleted: operation.current.deleted });
      await related.delete();
    } else {
      if (!operation.current || operation.current.deleted) throw new Error('Deleted cloud records cannot be restored by a stale edit. Create a new task instead.');
      await related.modify(row => {
        row.expectedRevision = operation.current!.revision;
        row.operationId = crypto.randomUUID();
        row.status = 'pending';
        delete row.current;
      });
    }
  });
}
