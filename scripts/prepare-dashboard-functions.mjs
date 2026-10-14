import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] ?? resolve(projectRoot, 'work/dashboard-functions'));
const sourceRoot = resolve(projectRoot, 'supabase/functions');
const auth = await readFile(resolve(sourceRoot, '_shared/auth.ts'), 'utf8');
const cors = await readFile(resolve(sourceRoot, '_shared/cors.ts'), 'utf8');
await mkdir(destination, { recursive: true });

for (const name of ['register-device', 'list-devices', 'revoke-device', 'validate-device']) {
  const original = await readFile(resolve(sourceRoot, name, 'index.ts'), 'utf8');
  const handler = original.replace(/^import .* from '\.\.\/_shared\/(?:auth|cors)\.ts';\r?\n/gm, '');
  if (handler.includes('../_shared/')) throw new Error(`Unresolved shared import in ${name}`);
  const bundled = `// DailyCheck: ${name}\n// Generated from the local project. Paste ALL of this file into index.ts.\n// Contains no private credentials. Authentication is enforced by requireUser using Supabase Auth.\n\n${auth}\n${cors}\n${handler}`;
  await writeFile(resolve(destination, `${name}.ts`), bundled, 'utf8');
}

await copyFile(
  resolve(projectRoot, 'supabase/migrations/0002_restrict_device_rpc_permissions.sql'),
  resolve(destination, '0002_restrict_device_rpc_permissions.sql')
);
console.log(`Prepared four self-contained Edge Functions and the permission fix in ${destination}`);
