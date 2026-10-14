import { beforeEach, expect, it } from 'vitest';
import { db, saveTask } from '../lib/db';
import { enableLocalSync, SyncEngine, type CloudTransport } from '../lib/cloudSync';
const account = '00000000-0000-4000-8000-000000000001';
beforeEach(async () => { for (const table of db.tables) await table.clear(); });
it('paused edits remain queued, and pause reaches the server on reconnection', async () => {
  await enableLocalSync(account, 'UTC');
  await db.syncStates.update(account, { enabled: false, configurationPending: true, configurationVersion: 2 });
  await saveTask({ accountId: account, name: 'Offline edit', weekdays: [1] });
  const configured: boolean[] = [];
  const transport: CloudTransport = { configure: async enabled => { configured.push(enabled); }, apply: async () => { throw new Error('Paused changes must not upload'); }, pull: async () => { throw new Error('Paused sync must not pull'); } };
  await new SyncEngine(account, transport).run();
  expect(configured).toEqual([false]); expect(await db.outbox.count()).toBe(1);
  expect((await db.syncStates.get(account))?.configurationPending).toBe(false);
});
it('an old configuration acknowledgement cannot erase a newer pause request', async () => {
  await enableLocalSync(account, 'UTC');
  let acknowledge!: () => void;
  const transport: CloudTransport = { configure: () => new Promise(resolve => { acknowledge = resolve; }),
    apply: async () => { throw new Error('Must not upload'); }, pull: async () => { throw new Error('Must not pull'); } };
  const running = new SyncEngine(account, transport).run();
  await new Promise(resolve => setTimeout(resolve, 10));
  await db.syncStates.update(account, { enabled: false, configurationPending: true, configurationVersion: 2 });
  acknowledge(); await running;
  expect((await db.syncStates.get(account))?.configurationPending).toBe(true);
  expect((await db.syncStates.get(account))?.enabled).toBe(false);
});
