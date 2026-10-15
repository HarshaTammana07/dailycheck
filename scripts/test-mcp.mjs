import { spawnSync } from 'node:child_process';
import path from 'node:path';
const environment = { ...process.env, DENO_DIR: path.resolve('work/deno-cache') };
for (const args of [
  ['check', '--config', 'supabase/functions/deno.json', 'supabase/functions/dailycheck-mcp/index.ts'],
  ['test', '--config', 'supabase/functions/deno.json', 'supabase/functions/dailycheck-mcp/server_test.ts']
]) {
  const result = spawnSync(process.execPath, ['node_modules/deno/bin.cjs', ...args], { env: environment, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
