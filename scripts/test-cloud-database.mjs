import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const pg = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const clientId = '00000000-0000-4000-8000-000000000003';
const taskId = '00000000-0000-4000-8000-000000000004';
const hash = 'a'.repeat(64);
await pg.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.jwt(), auth.uid() to authenticated;
create table public.registered_devices(user_id uuid, device_id_hash text, revoked_at timestamptz);
insert into auth.users values ('${owner}'), ('${other}');
insert into registered_devices values ('${owner}', '${hash}', null), ('${other}', '${hash}', null);`);
await pg.exec(await readFile('supabase/migrations/0003_cloud_sync.sql', 'utf8'));

async function asUser(user, oauth, fn) {
  await pg.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({ sub: user, role: 'authenticated', ...(oauth ? { client_id: oauth } : {}) })]);
  await pg.exec('set role authenticated');
  try { return await fn(); } finally { await pg.exec('reset role'); }
}
const scalar = async (sql, params = []) => (await pg.query(sql, params)).rows[0].result;
const configure = enabled => scalar('select public.cloud_configure($1, $2, $3) result', [enabled, 'America/Chicago', hash]);
const task = { id: taskId, name: 'Read', createdAt: '2026-10-14', updatedAt: '2026-10-14T18:00:00Z', recurrence: { frequency: 'daily', weekdays: [1, 3, 5] } };
const apply = (op, data = task, expected = 0, deleted = false, kind = 'task', id = data.id) =>
  scalar('select public.cloud_apply($1, $2, $3, $4, $5, $6, $7) result', [op, kind, id, data, expected, deleted, hash]);
const op = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let revision;

test('migration enables owner-only access and rejects direct writes', async () => {
  await asUser(owner, null, async () => {
    await configure(true);
    await assert.rejects(pg.query('insert into public.cloud_entities(owner, kind, id, payload, revision, origin) values ($1,$2,$3,$4,1,$5)', [owner, 'task', taskId, task, 'desktop']), /permission denied/);
    const result = await apply(op(100));
    assert.equal(result.status, 'applied'); revision = result.entity.revision;
    assert.equal((await pg.query('select * from cloud_entities')).rows.length, 1);
  });
  await asUser(other, null, async () => {
    await configure(true);
    assert.equal((await pg.query('select * from cloud_entities')).rows.length, 0);
    assert.deepEqual((await scalar("select cloud_list('task') result")).items, []);
    await assert.rejects(pg.exec("select cloud_configure(true, 'UTC', 'wrong-device')"), /not authorized/);
  });
});
test('durable retry returns same result and rejects changed payload', async () => {
  await asUser(owner, null, async () => {
    assert.equal((await apply(op(100))).entity.revision, revision);
    await assert.rejects(apply(op(100), { ...task, name: 'Different' }), /Idempotency key/);
    assert.equal((await scalar("select cloud_pull(0, 100, null, $1) result", [hash])).changes.length, 1);
  });
});
test('stale revision conflicts without overwriting a task', async () => {
  await asUser(owner, null, async () => {
    const result = await apply(op(101), { ...task, name: 'Updated' }, revision);
    assert.equal(result.status, 'applied');
    const conflict = await apply(op(102), { ...task, name: 'Lost edit' }, revision);
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.current.payload.name, 'Updated');
    revision = result.entity.revision;
  });
});
test('snapshot pagination keeps the original data across later edits', async () => {
  await asUser(owner, null, async () => {
    const before = await scalar("select cloud_list('task', 1) result");
    const newer = await apply(op(103), { ...task, name: 'Newer' }, revision);
    const snapshot = await scalar("select cloud_list('task', 1, '', $1) result", [before.snapshot]);
    assert.equal(snapshot.items[0].payload.name, 'Updated');
    assert.equal((await scalar("select cloud_list('task') result")).items[0].payload.name, 'Newer');
    revision = newer.entity.revision;
  });
});
test('unknown fields, invalid date, duplicate weekdays and foreign account input are rejected', async () => {
  await asUser(owner, null, async () => {
    for (const invalid of [{ ...task, accountId: other }, { ...task, createdAt: '2026-02-30' },
      { ...task, createdAt: undefined }, { ...task, recurrence: { frequency: 'daily', weekdays: [1, 1] } }, { ...task, name: ' ' }]) {
      await assert.rejects(apply(crypto.randomUUID(), invalid, revision));
    }
  });
});
test('OAuth grants enforce read versus create and cannot grant themselves access', async () => {
  await asUser(owner, clientId, async () => {
    await assert.rejects(scalar("select cloud_list('task') result"), /permission denied/i);
    await assert.rejects(pg.query('select cloud_set_grant($1, true)', [clientId]), /User session required/);
    await assert.rejects(configure(true), /Desktop session required/);
  });
  await asUser(owner, null, () => pg.query('select cloud_set_grant($1, false)', [clientId]));
  await asUser(owner, clientId, async () => {
    assert.equal((await scalar("select cloud_list('task') result")).items.length, 1);
    await assert.rejects(apply(op(104)), /permission denied/i);
  });
  await asUser(owner, null, () => pg.query('select cloud_set_grant($1, true)', [clientId]));
  await asUser(owner, clientId, async () => {
    const newTask = { ...task, id: op(500), name: 'From ChatGPT' };
    const result = await apply(op(105), newTask);
    assert.equal(result.entity.origin, 'mcp');
    assert.deepEqual(await apply(op(105), newTask), result);
    await assert.rejects(apply(op(106), newTask, result.entity.revision), /only has create permission/);
    await assert.rejects(apply(op(107), newTask, 0, true), /only has create permission/);
  });
});
test('revocation denies an otherwise-valid OAuth token immediately', async () => {
  await asUser(owner, null, () => pg.query('select cloud_set_grant($1, false, true)', [clientId]));
  await asUser(owner, clientId, () => assert.rejects(scalar("select cloud_list('task') result"), /permission denied/i));
});
test('deleting a task tombstones its completions and prevents resurrection', async () => {
  await asUser(owner, null, async () => {
    const id = `${owner}:${taskId}:2026-10-14`;
    const completion = { id, taskId, date: '2026-10-14', taskNameSnapshot: 'Read', completed: true, updatedAt: '2026-10-14T18:00:00Z' };
    assert.equal((await apply(op(108), completion, 0, false, 'completion')).status, 'applied');
    const deleted = await apply(op(109), task, revision, true);
    assert.equal(deleted.entity.deleted, true);
    assert.equal((await apply(op(110), task, deleted.entity.revision)).status, 'conflict');
    assert.equal((await scalar("select cloud_list('completion') result")).items.length, 0);
    const changes = (await scalar('select cloud_pull(0, 100, null, $1) result', [hash])).changes;
    assert(changes.some(row => row.kind === 'completion' && row.deleted));
  });
});
test('disabled cloud account and revoked installation reject access', async () => {
  await asUser(owner, null, () => configure(false));
  await asUser(owner, null, () => pg.query('select cloud_set_grant($1, false, true)', [clientId]));
  await asUser(owner, null, () => assert.rejects(scalar("select cloud_list('task') result"), /permission denied/i));
  await pg.query('update registered_devices set revoked_at = now() where user_id = $1', [owner]);
  await asUser(owner, null, () => assert.rejects(configure(true), /not authorized/));
});

test('bounded pagination keeps list pages and sync checkpoints stable across concurrent edits', async () => {
  await asUser(other, null, async () => {
    for (const n of [600, 601, 602]) await apply(op(n), { ...task, id: op(n) });
    const first = await scalar("select cloud_list('task', 1) result");
    assert.equal(first.items.length, 1); assert.equal(first.nextCursor, op(600));
    await apply(op(603), { ...task, id: op(603) });
    const second = await scalar("select cloud_list('task', 1, $1, $2) result", [first.nextCursor, first.snapshot]);
    const third = await scalar("select cloud_list('task', 1, $1, $2) result", [second.nextCursor, first.snapshot]);
    assert.equal(second.items[0].id, op(601)); assert.equal(third.items[0].id, op(602)); assert.equal(third.nextCursor, null);
    const pull = await scalar('select cloud_pull(0, 1, null, $1) result', [hash]);
    assert.equal(pull.hasMore, true); assert.equal(pull.next, 1);
    await apply(op(604), { ...task, id: op(604) });
    const rest = await scalar('select cloud_pull($1, 100, $2, $3) result', [pull.next, pull.snapshot, hash]);
    assert.equal(rest.hasMore, false); assert.equal(rest.next, pull.snapshot);
    assert(!rest.changes.some(row => row.id === op(604)));
    await assert.rejects(scalar("select cloud_list('task', 101) result"), /Invalid list query/);
    await assert.rejects(scalar('select cloud_pull(999, 100, null, $1) result', [hash]), /Invalid sync cursor/);
  });
});
test('anonymous users cannot execute cloud RPCs or read task tables', async () => {
  await pg.exec('set role anon');
  try {
    await assert.rejects(pg.exec("select cloud_list('task')"), /permission denied/);
    await assert.rejects(pg.exec('select * from cloud_entities'), /permission denied/);
  } finally { await pg.exec('reset role'); }
});
test.after(() => pg.close());
