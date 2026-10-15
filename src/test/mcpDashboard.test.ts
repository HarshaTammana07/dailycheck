import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TASK_DASHBOARD_HTML } from '../../supabase/functions/dailycheck-mcp/dashboard';

let receive: (event: any) => void;
let parent: { postMessage: ReturnType<typeof vi.fn> };
function send(data: object, source: unknown = parent) { receive({ source, data: { jsonrpc: '2.0', ...data } }); }
async function flush() { for (let count = 0; count < 6; count++) await Promise.resolve(); }
async function connected() {
  const init = parent.postMessage.mock.calls[0][0];
  send({ id: init.id, result: { hostContext: { theme: 'dark' } } }); await flush();
}
const payload = (rows: any[] = [{ id:'a',name:'Read',status:'completed',completedAt:'2026-10-14T18:30:00Z' }]) => ({
  structuredContent: { date:'2026-10-14',timezone:'America/Chicago',generated_at:'2026-10-14T19:00:00Z',rows }
});
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = TASK_DASHBOARD_HTML.match(/<body>([\s\S]*)<\/body>/)![1].replace(/<script>[\s\S]*?<\/script>/, '');
  parent = { postMessage: vi.fn() };
  const child = { parent, addEventListener: (_type: string, callback: typeof receive) => { receive = callback; } };
  const script = TASK_DASHBOARD_HTML.match(/<script>([\s\S]*?)<\/script>/)![1];
  new Function('window','document',script)(child,document);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('initializes the standard bridge and renders account time, status and task names safely', async () => {
  await connected();
  const data = payload([{ id:'a',name:'<img src=x onerror=alert(1)>',status:'completed',completedAt:'2026-10-14T18:30:00Z' }]);
  send({ method:'ui/notifications/tool-result',params:data });
  expect(document.querySelector('#rows')!.textContent).toContain('<img');
  expect(document.querySelector('#rows img')).toBeNull();
  expect(document.querySelector('#summary')!.textContent).toBe('1 of 1 completed');
  expect(document.querySelector('time')!.dateTime).toBe('2026-10-14T18:30:00Z');
  expect(document.querySelector('#timezone')!.textContent).toContain('America/Chicago');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(parent.postMessage.mock.calls.some(([message]) => message.method === 'ui/notifications/initialized')).toBe(true);
});

it('ignores messages from other frames and presents the empty state', async () => {
  await connected();
  send({ method:'ui/notifications/tool-result',params:payload() }, {});
  expect(document.querySelector('#rows')!.children).toHaveLength(0);
  send({ method:'ui/notifications/tool-result',params:payload([]) });
  expect(document.querySelector('#notice')!.textContent).toBe('No tasks for this day.');
  expect(document.querySelector<HTMLElement>('#table-wrap')!.hidden).toBe(true);
});

it('Refresh calls only the read-only dashboard tool with the selected date', async () => {
  await connected();
  (document.querySelector('#date') as HTMLInputElement).value = '2026-10-15';
  document.querySelector('#controls')!.dispatchEvent(new Event('submit', { cancelable:true })); await flush();
  const call = parent.postMessage.mock.calls.map(([message]) => message).find(message => message.method === 'tools/call');
  expect(call.params).toEqual({ name:'show_task_dashboard',arguments:{ date:'2026-10-15' } });
  send({ id:call.id,result:payload([]) }); await flush();
  expect(document.querySelector<HTMLButtonElement>('#refresh')!.disabled).toBe(false);
});

it('clears previously displayed records when access fails and allows retry', async () => {
  await connected();
  send({ method:'ui/notifications/tool-result',params:payload() });
  document.querySelector('#controls')!.dispatchEvent(new Event('submit', { cancelable:true })); await flush();
  const call = parent.postMessage.mock.calls.map(([message]) => message).find(message => message.method === 'tools/call');
  send({ id:call.id,result:{ isError:true } }); await flush();
  expect(document.querySelector('#rows')!.children).toHaveLength(0);
  expect(document.querySelector('#notice')!.textContent).toContain('permissions');
  expect(document.querySelector<HTMLButtonElement>('#refresh')!.disabled).toBe(false);
});

it('shows a recoverable message if the host handshake times out', async () => {
  await vi.advanceTimersByTimeAsync(30000);
  expect(document.querySelector('#notice')!.textContent).toContain('timed out');
  document.querySelector('#controls')!.dispatchEvent(new Event('submit', { cancelable:true })); await flush();
  const initializations = parent.postMessage.mock.calls.filter(([message]) => message.method === 'ui/initialize');
  expect(initializations).toHaveLength(2);
});
