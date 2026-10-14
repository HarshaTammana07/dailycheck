import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const electronCache = path.join(root, 'work', 'electron-cache');
const builderCache = path.join(root, 'work', 'electron-builder-cache');
const localAppData = path.join(root, 'work', 'localappdata');
const appData = path.join(root, 'work', 'appdata');
fs.mkdirSync(electronCache, { recursive: true });
fs.mkdirSync(builderCache, { recursive: true });
fs.mkdirSync(localAppData, { recursive: true });
fs.mkdirSync(appData, { recursive: true });

const command = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
const result = spawnSync(path.join(root, 'node_modules', '.bin', command), process.argv.slice(2), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    APPDATA: appData,
    ELECTRON_CACHE: electronCache,
    ELECTRON_BUILDER_CACHE: builderCache,
    LOCALAPPDATA: localAppData
  }
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
