import { beforeEach, describe, expect, it } from 'vitest';
import { db, saveTask } from '../lib/db';
import { enableLocalSync, resolveConflict, SyncEngine, type CloudTransport } from '../lib/cloudSync';
import type { CloudEntity, OutboxOperation } from '../lib/cloudTypes';

const account = '00000000-0000-4000-8000-000000000001';
const taskId = '00000000-0000-4000-8000-000000000002';
const entity: CloudEntity = { kind: 'task', id: taskId, payload: { id: taskId, name: 'Cloud task', createdAt: '2026-10-14', updatedAt: '2026-10-14T18:00:00Z', recurrence: { frequency: 'daily', weekdays: [1] } }, revision: 1, origin: 'mcp', deleted: false, updated_at: '2026-10-14T18:00:00Z' };
const emptyPull = async () => ({ changes: [], next: 0, snapshot: 0, hasMore: false });
const transport = (overrides: Partial<CloudTransport> = {}): CloudTransport => ({ configure: async () => {},
  apply: async (op: OutboxOperation) => ({ status: 'applied', entity: { ...entity, id: op.entityId, payload: op.payload } }), pull: emptyPull, ...overrides });
beforeEach(async () => { for (const table of db.tables) await table.clear(); });

describe('durable offline synchronization', () => {
  it('keeps local-only tasks local until consent and seeds exactly once', async () => {
    await saveTask({ accountId: account, name: 'Read', weekdays: [1] });
    expect(await db.outbox.count()).toBe(0);
    await enableLocalSync(account, 'UTC'); await enableLocalSync(account, 'UTC');
    expect(await db.outbox.count()).toBe(1);
  });
  it('survives a lost acknowledgement with the same operation ID', async () => {
    await enableLocalSync(account, 'UTC'); await saveTask({ accountId: account, name: 'Read', weekdays: [1] });
    const id = (await db.outbox.toArray())[0].operationId;
    const seen: string[] = [];
    const engine = new SyncEngine(account, transport({ apply: async op => {
      seen.push(op.operationId); if (seen.length === 1) throw new Error('Lost acknowledgement');
      return { status: 'applied', entity: { ...entity, id: op.entityId, payload: op.payload } };
    } }));
    await expect(engine.run()).rejects.toThrow('Lost acknowledgement');
    expect((await db.outbox.toArray())[0].operationId).toBe(id);
    await engine.run(); expect(seen).toEqual([id, id]); expect(await db.outbox.count()).toBe(0);
  });
  it('pulls a task created while the desktop was closed', async () => {
    await enableLocalSync(account, 'UTC');
    await new SyncEngine(account, transport({ pull: async () => ({ changes: [entity], next: 1, snapshot: 1, hasMore: false }) })).run();
    expect((await db.tasks.get(taskId))?.name).toBe('Cloud task');
    expect((await db.syncStates.get(account))?.checkpoint).toBe(1);
  });
  it('cancels an in-flight response when the account session ends', async () => {
    await enableLocalSync(account, 'UTC');
    let deliver!: (value: Awaited<ReturnType<CloudTransport['pull']>>) => void;
    const engine = new SyncEngine(account, transport({ pull: () => new Promise(resolve => { deliver = resolve; }) }));
    const running = engine.run();
    await new Promise(resolve => setTimeout(resolve, 10)); engine.stop();
    deliver({ changes: [entity], next: 1, snapshot: 1, hasMore: false });
    await expect(running).rejects.toThrow('cancelled'); expect(await db.tasks.count()).toBe(0);
  });
  it('keeps local edits during a conflict and allows an explicit cloud resolution', async () => {
    await enableLocalSync(account, 'UTC'); await saveTask({ id: taskId, accountId: account, name: 'Local edit', weekdays: [1] });
    await new SyncEngine(account, transport({ apply: async () => ({ status: 'conflict', current: entity }),
      pull: async () => ({ changes: [entity], next: 1, snapshot: 1, hasMore: false }) })).run();
    expect((await db.tasks.get(taskId))?.name).toBe('Local edit');
    const operation = (await db.outbox.toArray())[0]; expect(operation.status).toBe('conflict');
    await resolveConflict(account, operation.sequence!, 'cloud');
    expect((await db.tasks.get(taskId))?.name).toBe('Cloud task'); expect(await db.outbox.count()).toBe(0);
  });
  it('processes unrelated tasks while an earlier task has a conflict', async () => {
    await enableLocalSync(account, 'UTC'); await saveTask({ id: taskId, accountId: account, name: 'Conflict', weekdays: [1] });
    await db.outbox.toCollection().modify({ status: 'conflict', current: entity });
    await saveTask({ accountId: account, name: 'Unrelated', weekdays: [1] });
    const applied: string[] = [];
    await new SyncEngine(account, transport({ apply: async op => { applied.push(op.entityId); return { status: 'applied', entity: { ...entity, id: op.entityId, payload: op.payload } }; } })).run();
    expect(applied.length).toBe(1); expect(applied[0]).not.toBe(taskId);
  });
  it('rebases later local edits only after their preceding operation is acknowledged', async () => {
    await enableLocalSync(account, 'UTC'); await saveTask({ id: taskId, accountId: account, name: 'First', weekdays: [1] });
    await saveTask({ id: taskId, accountId: account, name: 'Second', weekdays: [1] });
    const bases: number[] = [];
    await new SyncEngine(account, transport({ apply: async op => { bases.push(op.expectedRevision); return { status: 'applied', entity: { ...entity, payload: op.payload, revision: bases.length * 5 } }; } })).run();
    expect(bases).toEqual([0, 5]);
  });
  it('cannot resolve another account’s conflict', async () => {
    await enableLocalSync(account, 'UTC'); await saveTask({ id: taskId, accountId: account, name: 'Read', weekdays: [1] });
    await db.outbox.toCollection().modify({ status: 'conflict', current: entity });
    await expect(resolveConflict('another-user', (await db.outbox.toArray())[0].sequence!, 'cloud')).rejects.toThrow('no longer available');
  });
  it('never deletes a colliding local record belonging to another account', async () => {
    await db.tasks.put({ ...entity.payload, accountId: 'another-user' } as any);
    await enableLocalSync(account, 'UTC');
    await expect(new SyncEngine(account, transport({ pull: async () => ({ changes: [{ ...entity, deleted: true }], next: 1, snapshot: 1, hasMore: false }) })).run()).rejects.toThrow('another account');
    expect((await db.tasks.get(taskId))?.accountId).toBe('another-user');
    expect((await db.syncStates.get(account))?.checkpoint).toBe(0);
  });
  it('explicit cloud resolution records its revision for the next edit', async () => {
    await enableLocalSync(account, 'UTC'); await saveTask({ id: taskId, accountId: account, name: 'Local', weekdays: [1] });
    await new SyncEngine(account, transport({ apply: async () => ({ status: 'conflict', current: { ...entity, revision: 42 } }) })).run();
    await resolveConflict(account, (await db.outbox.toArray())[0].sequence!, 'cloud');
    await saveTask({ id: taskId, accountId: account, name: 'Reviewed edit', weekdays: [1] });
    expect((await db.outbox.toArray())[0].expectedRevision).toBe(42);
  });
});
