import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const destination = resolve(process.argv[2] ?? 'work/cloud-dashboard');
await mkdir(destination, { recursive: true });
const devices = spawnSync(process.execPath, ['scripts/prepare-dashboard-functions.mjs', destination], { stdio: 'inherit', windowsHide: true });
if (devices.status !== 0) process.exit(devices.status ?? 1);
const domain = await readFile('supabase/functions/_shared/domain.ts', 'utf8');
const dashboard = await readFile('supabase/functions/dailycheck-mcp/dashboard.ts', 'utf8');
const server = (await readFile('supabase/functions/dailycheck-mcp/server.ts', 'utf8'))
  .replace(/^import .* from '\.\.\/_shared\/domain\.ts';\r?\n/gm, '')
  .replace(/^import .* from '\.\/dashboard\.ts';\r?\n/gm, '');
const entry = (await readFile('supabase/functions/dailycheck-mcp/index.ts', 'utf8')).replace(/^import .* from '\.\/server\.ts';\r?\n/gm, '');
if (/from ['"]\.\//.test(entry) || /from ['"]\.\.?\//.test(server)) throw new Error('Unresolved local imports in MCP dashboard bundle.');
await writeFile(resolve(destination, 'dailycheck-mcp.ts'), '// Generated DailyCheck MCP dashboard bundle. Contains no private credentials.\n' + domain + '\n' + dashboard + '\n' + server + '\n' + entry);
await copyFile('supabase/migrations/0003_cloud_sync.sql', resolve(destination, '0003_cloud_sync.sql'));
console.log(`Prepared MCP, device handlers, and the additive cloud migration in ${destination}`);
