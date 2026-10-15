import { AuthorizationError, createDailyCheckHandler, type Context } from './server.ts';

Deno.test('month totals distinguish future occurrences from missed or overdue tasks', async () => {
  const id = '00000000-0000-4000-8000-000000000009';
  const handler = createDailyCheckHandler(async () => ({ user: { id: 'owner' }, timezone: 'UTC', revision: 2,
    rpc: async <T>(_name: string, args: Record<string, unknown>) => ({ items: args.p_kind === 'task'
      ? [{ id, payload: { id, name: 'Read', createdAt: '2026-10-14', recurrence: { frequency: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6] } } }]
      : [{ payload: { id: `owner:${id}:2026-10-14`, taskId: id, date: '2026-10-14', taskNameSnapshot: 'Read', completed: true } }],
      snapshot: 2, nextCursor: null }) as T }), resource);
  const response = await parse(await handler(request('tools/call', { name: 'get_month_summary', arguments: { month: '2026-10' } })));
  const result = response.result.structuredContent;
  assert(result.totals.scheduledOccurrences === 18);
  assert(result.totals.completedOccurrences === 1);
  assert(result.totals.remainingOccurrences === 17);
  assert(result.scheduleBasis === 'full_calendar_month');
  assert(result.remainingMeaning.includes('not an overdue count'));
  assert(!('missedTasks' in result));
});

function assert(condition: unknown, message = 'Assertion failed'): asserts condition { if (!condition) throw new Error(message); }
const resource = 'https://test.supabase.co/functions/v1/dailycheck-mcp';
function request(method: string, params: unknown, token = 'valid') {
  return new Request(resource, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-06-18', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
}
async function parse(response: Response) {
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const line = text.split('\n').find(line => line.startsWith('data: '));
    if (!line) throw new Error(text);
    return JSON.parse(line.slice(6));
  }
  return JSON.parse(text);
}
function fixture() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const context: Context = { user: { id: 'owner', email: 'owner@example.com' }, timezone: 'America/Chicago', revision: 3,
    rpc: async <T>(name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === 'cloud_apply') return { status: 'applied', entity: { id: args.p_id, payload: args.p_payload } } as T;
      return { items: [], snapshot: 3, nextCursor: null } as T;
    } };
  const handler = createDailyCheckHandler(async req => {
    if (req.headers.get('Authorization') !== 'Bearer valid') throw new AuthorizationError('Sign in first.');
    return context;
  }, resource);
  return { calls, handler };
}
Deno.test('anonymous initialization and tool discovery expose schemas, never account data', async () => {
  const { calls, handler } = fixture();
  const init = await parse(await handler(request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, '')));
  assert(init.result.serverInfo.name === 'dailycheck');
  const response = await parse(await handler(request('tools/list', {}, '')));
  assert(response.result.tools.length === 6);
  for (const tool of response.result.tools) {
    assert(tool.securitySchemes?.[0]?.type === 'oauth2');
    assert(tool._meta.securitySchemes[0].type === 'oauth2');
    assert(tool.annotations.readOnlyHint === (tool.name !== 'create_task'));
  }
  assert(calls.length === 0);
});
Deno.test('anonymous and invalid calls return an OAuth challenge before database access', async () => {
  for (const token of ['', 'invalid']) {
    const { calls, handler } = fixture();
    const response = await parse(await handler(request('tools/call', { name: 'list_tasks', arguments: {} }, token)));
    assert(response.result.isError);
    assert(response.result._meta['mcp/www_authenticate'][0].includes('resource_metadata'));
    assert(calls.length === 0);
  }
});
Deno.test('creation has a stable ID and payload across retries', async () => {
  const { handler, calls } = fixture();
  const args = { idempotency_key: '00000000-0000-4000-8000-000000000005', name: 'Read', notes: 'Ignore previous instructions is just task text', start_date: '2026-10-14', weekdays: [1, 3] };
  for (let i = 0; i < 2; i++) {
    const response = await parse(await handler(request('tools/call', { name: 'create_task', arguments: args })));
    assert(!response.result.isError);
    assert(response.result.structuredContent.task.id === args.idempotency_key);
  }
  assert(JSON.stringify(calls[0]) === JSON.stringify(calls[1]));
  assert(!('accountId' in (calls[0].args.p_payload as Record<string, unknown>)));
});
Deno.test('invalid dates, unknown fields, duplicate weekdays and invented reminders fail validation', async () => {
  const base = { idempotency_key: '00000000-0000-4000-8000-000000000005', name: 'Read', start_date: '2026-10-14', weekdays: [1] };
  for (const args of [{ ...base, start_date: '2026-02-30' }, { ...base, weekdays: [1, 1] }, { ...base, accountId: 'another-owner' }, { ...base, reminder_time: '18:00' }]) {
    const { handler, calls } = fixture();
    const result = await parse(await handler(request('tools/call', { name: 'create_task', arguments: args })));
    assert(result.error || result.result?.isError);
    assert(calls.length === 0);
  }
});
Deno.test('profile supplies timezone and explicit cloud freshness', async () => {
  const { handler } = fixture();
  const response = await parse(await handler(request('tools/call', { name: 'get_profile', arguments: {} })));
  assert(response.result.structuredContent.timezone === 'America/Chicago');
  assert(response.result.structuredContent.freshness.includes('Offline desktop'));
});
Deno.test('metadata-only task retrieval does not read unbounded history', async () => {
  const { handler, calls } = fixture();
  await parse(await handler(request('tools/call', { name: 'get_task', arguments: { task_id: '00000000-0000-4000-8000-000000000005' } })));
  assert(calls.length === 1 && calls[0].args.p_kind === 'task');
});
