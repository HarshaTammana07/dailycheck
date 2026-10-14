import { spawnSync } from 'node:child_process';
const [platform, mode = 'development'] = process.argv.slice(2);
if (!['windows', 'macos'].includes(platform) || !['development', 'production'].includes(mode)) throw new Error('Usage: build-release.mjs windows|macos development|production');
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
  if (!process.env[name] || /your-project|replace-with/.test(process.env[name])) throw new Error(`Configure repository variable ${name}`);
}
if (mode === 'production') {
  const required = platform === 'windows' ? ['CSC_LINK', 'CSC_KEY_PASSWORD'] : ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
  for (const name of required) if (!process.env[name]) throw new Error(`Production signing requires ${name}`);
}
const args = platform === 'windows' ? ['--win', 'nsis', '--x64'] : ['--mac', 'dmg', 'zip', '--x64', '--arm64'];
args.push('--publish=never', `--config.extraMetadata.dailycheckReleaseMode=${mode}`, `--config.forceCodeSigning=${mode === 'production'}`);
if (platform === 'windows') args.push(`--config.win.verifyUpdateCodeSignature=${mode === 'production'}`);
if (platform === 'macos') args.push(`--config.mac.notarize=${mode === 'production'}`);
const result = spawnSync(process.execPath, ['scripts/run-electron-builder.mjs', ...args], { stdio: 'inherit', env: { ...process.env, ...(mode === 'development' ? { CSC_IDENTITY_AUTO_DISCOVERY: 'false' } : {}) } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
