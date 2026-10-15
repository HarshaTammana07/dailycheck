// Self-contained MCP App. Public template only; account data arrives through the host bridge.
export const TASK_DASHBOARD_URI = 'ui://dailycheck/tasks-v1.html';
export const TASK_DASHBOARD_MIME = 'text/html;profile=mcp-app';
export const TASK_DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DailyCheck tasks</title><style>
:root{color-scheme:light dark;--bg:#fff;--ink:#182d26;--muted:#65756e;--line:#dde6e0;--soft:#f4f7f5;--accent:#21634b;--badge:#e5f3eb;font-family:system-ui,sans-serif;font-size:14px}
@media(prefers-color-scheme:dark){:root{--bg:#14211c;--ink:#edf5f0;--muted:#a5b8ad;--line:#34463c;--soft:#1d2d24;--accent:#8bdbb3;--badge:#244735}}
:root[data-theme=light]{color-scheme:light;--bg:#fff;--ink:#182d26;--muted:#65756e;--line:#dde6e0;--soft:#f4f7f5;--accent:#21634b;--badge:#e5f3eb}
:root[data-theme=dark]{color-scheme:dark;--bg:#14211c;--ink:#edf5f0;--muted:#a5b8ad;--line:#34463c;--soft:#1d2d24;--accent:#8bdbb3;--badge:#244735}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}main{padding:20px;max-width:960px;margin:auto}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}h1{font-size:21px;margin:4px 0}p{margin:8px 0;line-height:1.5}
.brand{font-size:11px;letter-spacing:.13em;font-weight:700;color:var(--accent)}.muted,footer{color:var(--muted);font-size:12px}
form{display:flex;align-items:end;gap:8px;flex-wrap:wrap}label{font-size:12px;color:var(--muted);display:grid;gap:5px}
input,button{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;min-height:38px}
button{font-weight:600;background:var(--soft);cursor:pointer}button:disabled{cursor:wait;opacity:.6}:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#summary{margin-top:18px;font-weight:600}#notice{padding:12px;border-radius:8px;background:var(--soft)}#notice[data-error=true]{border:1px solid #bb5b4c}
.table-wrap{overflow:auto;max-height:380px;margin:12px 0;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:390px}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}th{position:sticky;top:0;background:var(--soft);font-size:12px;color:var(--muted)}tr:last-child td{border-bottom:0}
td:first-child{overflow-wrap:anywhere;min-width:140px}.badge{display:inline-block;border-radius:99px;padding:3px 8px;background:var(--soft);white-space:nowrap;font-size:12px}.badge.done{color:var(--accent);background:var(--badge)}time{white-space:nowrap;font-size:12px}
footer{margin-top:12px}footer p{margin:4px 0}[hidden]{display:none!important}@media(max-width:480px){main{padding:14px}header{gap:10px}}
</style></head><body><main>
<header><div><span class="brand">DAILYCHECK</span><h1>Your daily tasks</h1><p id="timezone" class="muted">Read-only cloud checklist</p></div>
<form id="controls"><label>Selected day<input id="date" type="date"></label><button id="refresh" type="submit">Refresh</button></form></header>
<p id="summary" hidden></p><p id="notice" role="status" aria-live="polite">Loading your checklist…</p>
<div id="table-wrap" class="table-wrap" hidden><table><caption class="muted" id="caption">Daily tasks</caption><thead><tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Completed at</th></tr></thead><tbody id="rows"></tbody></table></div>
<footer><p id="updated"></p><p>Cloud records only. Offline changes appear after DailyCheck syncs.</p></footer>
</main><script>
(() => {
  const byId = id => document.getElementById(id);
  const pending = new Map();
  let nextId = 0, ready, busy = false;
  function theme(context) { if (['light','dark'].includes(context?.theme)) document.documentElement.dataset.theme = context.theme; }
  function notify(method, params) { window.parent.postMessage({jsonrpc:'2.0',method,params}, '*'); }
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = 'dailycheck-' + (++nextId);
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Request timed out. Please try Refresh again.')); }, 30000);
      pending.set(id, {resolve,reject,timeout});
      window.parent.postMessage({jsonrpc:'2.0',id,method,params}, '*');
    });
  }
  function failure(text) {
    byId('rows').replaceChildren(); byId('table-wrap').hidden = true; byId('summary').hidden = true; byId('updated').textContent = '';
    byId('notice').hidden = false; byId('notice').dataset.error = 'true'; byId('notice').textContent = text;
  }
  function render(result) {
    if (result?.isError) { failure('Could not load tasks. Check your DailyCheck connection and cloud permissions, then try Refresh.'); return; }
    const data = result?.structuredContent;
    if (!data || !Array.isArray(data.rows) || typeof data.date !== 'string' || typeof data.timezone !== 'string') { failure('The dashboard received an unexpected response. Try Refresh.'); return; }
    byId('date').value = data.date;
    byId('timezone').textContent = 'Times shown in ' + data.timezone;
    byId('caption').textContent = 'Tasks for ' + data.date;
    byId('rows').replaceChildren();
    let completed = 0;
    for (const task of data.rows) {
      if (task.status === 'completed') completed++;
      const row = document.createElement('tr');
      const name = row.insertCell(); name.textContent = task.name;
      const badge = document.createElement('span'); badge.className = 'badge' + (task.status === 'completed' ? ' done' : '');
      badge.textContent = task.status === 'completed' ? 'Completed' : task.status === 'not_scheduled' ? 'Not scheduled' : 'Pending';
      row.insertCell().append(badge);
      const cell = row.insertCell(); cell.textContent = '—';
      if (task.status === 'completed' && task.completedAt && Number.isFinite(Date.parse(task.completedAt))) {
        const time = document.createElement('time'); time.dateTime = task.completedAt;
        time.textContent = new Intl.DateTimeFormat(undefined, {timeZone:data.timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(task.completedAt));
        cell.replaceChildren(time);
      }
      byId('rows').append(row);
    }
    byId('summary').textContent = completed + ' of ' + data.rows.length + ' completed'; byId('summary').hidden = false;
    byId('notice').dataset.error = 'false'; byId('notice').hidden = data.rows.length > 0; byId('notice').textContent = 'No tasks for this day.';
    byId('table-wrap').hidden = data.rows.length === 0;
    byId('updated').textContent = data.generated_at && Number.isFinite(Date.parse(data.generated_at))
      ? 'Retrieved ' + new Intl.DateTimeFormat(undefined, {timeZone:data.timezone,hour:'numeric',minute:'2-digit'}).format(new Date(data.generated_at)) + ' · ' + data.timezone : '';
  }
  function connect() {
    if (!ready) ready = request('ui/initialize', {protocolVersion:'2026-01-26',appInfo:{name:'dailycheck-tasks',version:'1.0.0'},appCapabilities:{}})
      .then(result => { theme(result.hostContext); notify('ui/notifications/initialized', {}); })
      .catch(error => { ready = undefined; throw error; });
    return ready;
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
    const data = event.data;
    if (pending.has(data.id)) {
      const item = pending.get(data.id); pending.delete(data.id); clearTimeout(item.timeout);
      if (data.error) item.reject(new Error(data.error.message || 'Request failed.')); else item.resolve(data.result);
    } else if (data.method === 'ui/notifications/tool-result' && !busy) {
      try { render(data.params); } catch { failure('Could not display this checklist. Try Refresh.'); }
    } else if (data.method === 'ui/notifications/host-context-changed') theme(data.params);
  });
  byId('controls').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; byId('refresh').disabled = true; byId('refresh').textContent = 'Loading…';
    try {
      await connect();
      const date = byId('date').value;
      render(await request('tools/call', {name:'show_task_dashboard',arguments:date ? {date} : {}}));
    } catch(error) { failure(error.message || 'Unable to refresh tasks.'); }
    finally { busy = false; byId('refresh').disabled = false; byId('refresh').textContent = 'Refresh'; }
  });
  connect().catch(error => failure(error.message));
})();
</script></body></html>`;
