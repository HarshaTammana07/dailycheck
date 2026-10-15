import { beforeEach, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, importAccountData, saveTask } from '../lib/db';
import { enableLocalSync } from '../lib/cloudSync';
import type { ExportPayload } from '../types';
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const payload: ExportPayload = { accountId: owner, schemaVersion: 2, exportedAt: '2026-10-14T18:00:00Z',
  tasks: [{ id, accountId: owner, name: 'Read', createdAt: '2026-10-14', updatedAt: '2026-10-14T18:00:00Z', recurrence: { frequency: 'daily', weekdays: [1] } }],
  completions: [{ id: `${owner}:${id}:2026-10-14`, accountId: owner, taskId: id, taskNameSnapshot: 'Read', date: '2026-10-14', completed: true, updatedAt: '2026-10-14T18:00:00Z' }] };
beforeEach(async () => { for (const table of db.tables) await table.clear(); });
it('cross-account imports use stable namespaced IDs without overwriting the source account', async () => {
  await importAccountData(owner, payload); await importAccountData(other, payload); await importAccountData(other, payload);
  expect((await db.tasks.get(id))?.accountId).toBe(owner);
  const imported = await db.tasks.where('accountId').equals(other).toArray(); expect(imported).toHaveLength(1); expect(imported[0].id).not.toBe(id);
  const completion = (await db.completions.where('accountId').equals(other).toArray())[0];
  expect(completion.id).toBe(`${other}:${imported[0].id}:2026-10-14`);
});
it('repeated imports do not create duplicate outbox operations', async () => {
  await enableLocalSync(owner, 'UTC'); await importAccountData(owner, payload); await importAccountData(owner, payload);
  expect(await db.outbox.count()).toBe(2);
});
it('invalid or mixed-account imports leave existing data untouched', async () => {
  await importAccountData(owner, payload);
  await expect(importAccountData(owner, { ...payload, tasks: [{ ...payload.tasks[0], accountId: other }] })).rejects.toThrow('mixed accounts');
  await expect(importAccountData(owner, { ...payload, completions: [{ ...payload.completions[0], date: '2026-02-30' }] })).rejects.toThrow('Invalid completion');
  expect(await db.tasks.count()).toBe(1); expect(await db.completions.count()).toBe(1);
});
it('schema upgrade preserves legacy tasks and completions before any upload consent', async () => {
  await db.delete();
  const old = new Dexie('dailycheck');
  old.version(2).stores({ tasks: 'id, accountId, archivedAt, createdAt', completions: 'id, accountId, taskId, date, [accountId+date], [accountId+taskId+date]', preferences: 'accountId', deviceLeases: '&userId, authorizedUntil' });
  await old.table('tasks').bulkPut(payload.tasks); await old.table('completions').bulkPut(payload.completions); old.close();
  await db.open(); expect((await db.tasks.get(id))?.name).toBe('Read'); expect(await db.completions.count()).toBe(1);
  expect(await db.syncStates.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
});
it('a stale editor cannot overwrite a newly loaded task', async () => {
  await importAccountData(owner, payload);
  await db.tasks.update(id, { updatedAt: '2026-10-14T19:00:00Z', name: 'Remote update' });
  await expect(saveTask({ accountId: owner, id, name: 'Stale edit', weekdays: [1], expectedUpdatedAt: payload.tasks[0].updatedAt })).rejects.toThrow('changed');
  expect((await db.tasks.get(id))?.name).toBe('Remote update');
});
it('a stale editor cannot recreate a deleted task', async () => {
  await importAccountData(owner, payload); await db.tasks.delete(id);
  await expect(saveTask({ accountId: owner, id, name: 'Stale edit', weekdays: [1], expectedUpdatedAt: payload.tasks[0].updatedAt })).rejects.toThrow('deleted');
  expect(await db.tasks.count()).toBe(0);
});
