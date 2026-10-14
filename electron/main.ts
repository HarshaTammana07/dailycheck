import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, safeStorage, shell } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type StoreRecord = {
  encrypted: boolean;
  value: string;
};

type WindowBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

const SECURE_PREFIXES = ['supabase:', 'dailycheck:'];
const UPDATE_CHANNEL = 'updates:event';
const AUTH_CALLBACK_CHANNEL = 'auth:callback';
let mainWindow: BrowserWindow | null = null;
let pendingAuthCallback: string | null = null;
let updateState: Record<string, unknown> = { type: 'idle' };
let updateAvailable = false;
let updateDownloaded = false;
let downloadingUpdate = false;
const packageMetadata = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as { dailycheckReleaseMode?: string };
const releaseMode = packageMetadata.dailycheckReleaseMode === 'production' ? 'production' : 'development';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.disableWebInstaller = true;
autoUpdater.logger = log;
log.transports.file.level = 'info';

function storePath() {
  return path.join(app.getPath('userData'), 'secure-store.json');
}

function readStore(): Record<string, StoreRecord> {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8')) as Record<string, StoreRecord>;
  } catch {
    return {};
  }
}

function writeStore(records: Record<string, StoreRecord>) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(records, null, 2), { mode: 0o600 });
}

function assertAllowedKey(key: string) {
  if (!SECURE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new Error('Unsupported secure storage key');
  }
}

function secureGet(key: string): string | null {
  assertAllowedKey(key);
  const record = readStore()[key];
  if (!record) return null;

  if (!record.encrypted) return record.value;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    return safeStorage.decryptString(Buffer.from(record.value, 'base64'));
  } catch (error) {
    log.warn('Unable to decrypt secure store key', key, error);
    return null;
  }
}

function secureSet(key: string, value: string) {
  assertAllowedKey(key);
  const records = readStore();
  if (safeStorage.isEncryptionAvailable()) {
    records[key] = {
      encrypted: true,
      value: safeStorage.encryptString(value).toString('base64')
    };
  } else {
    records[key] = {
      encrypted: false,
      value
    };
  }
  writeStore(records);
}

function secureRemove(key: string) {
  assertAllowedKey(key);
  const records = readStore();
  delete records[key];
  writeStore(records);
}

function getInstallationId() {
  const existing = secureGet('dailycheck:installationId');
  if (existing) return existing;

  const created = randomUUID();
  secureSet('dailycheck:installationId', created);
  return created;
}

function getDeviceInfo() {
  const installationId = getInstallationId();
  return {
    deviceIdHash: createHash('sha256').update(installationId).digest('hex'),
    deviceName: os.hostname(),
    operatingSystem: `${process.platform} ${os.release()}`,
    appVersion: app.getVersion(),
    platform: process.platform
  };
}

function loadWindowBounds(): WindowBounds {
  const stored = secureGet('dailycheck:windowBounds');
  if (!stored) return { width: 1220, height: 820 };
  try {
    const parsed = JSON.parse(stored) as WindowBounds;
    return {
      width: Math.max(parsed.width || 1220, 980),
      height: Math.max(parsed.height || 820, 680),
      x: parsed.x,
      y: parsed.y
    };
  } catch {
    return { width: 1220, height: 820 };
  }
}

function saveWindowBounds(window: BrowserWindow) {
  if (window.isDestroyed()) return;
  secureSet('dailycheck:windowBounds', JSON.stringify(window.getBounds()));
}

function isAllowedExternalUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

async function createWindow() {
  const bounds = loadWindowBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: 'DailyCheck',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141713' : '#f7f5ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', () => mainWindow && saveWindowBounds(mainWindow));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (currentUrl && url !== currentUrl) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function sendUpdateEvent(payload: Record<string, unknown>) {
  updateState = { ...updateState, ...payload, releaseMode };
  mainWindow?.webContents.send(UPDATE_CHANNEL, updateState);
}

async function checkUpdates() {
  if (!app.isPackaged) {
    sendUpdateEvent({ type: 'skipped', message: 'Updates are available in installed builds.' });
    return { skipped: true };
  }
  if (!['win32', 'darwin'].includes(process.platform) || (process.platform === 'darwin' && releaseMode !== 'production')) {
    sendUpdateEvent({ type: 'skipped', message: process.platform === 'darwin' ? 'macOS automatic updates require a signed production build.' : 'Updates are not supported on this platform.' });
    return { skipped: true };
  }
  return autoUpdater.checkForUpdates();
}

function handleAuthCallback(url: string) {
  if (!url.startsWith('dailycheck://')) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(AUTH_CALLBACK_CHANNEL, url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingAuthCallback = url;
  }
}

function configureUpdater() {
  autoUpdater.on('checking-for-update', () => sendUpdateEvent({ type: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    updateDownloaded = false;
    sendUpdateEvent({ type: 'available', info });
  });
  autoUpdater.on('update-not-available', (info) => {
    updateAvailable = false;
    sendUpdateEvent({ type: 'not-available', info });
  });
  autoUpdater.on('download-progress', (progress) => sendUpdateEvent({ type: 'download-progress', progress }));
  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    downloadingUpdate = false;
    sendUpdateEvent({ type: 'downloaded', info });
  });
  autoUpdater.on('error', (error) => {
    downloadingUpdate = false;
    sendUpdateEvent({ type: 'error', message: error.message });
  });
}

function configureIpc() {
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('secure-storage:get', (_event, key: string) => secureGet(key));
  ipcMain.handle('secure-storage:set', (_event, key: string, value: string) => secureSet(key, value));
  ipcMain.handle('secure-storage:remove', (_event, key: string) => secureRemove(key));
  ipcMain.handle('device:get-info', () => getDeviceInfo());
  ipcMain.handle('updates:state', () => updateState);
  ipcMain.handle('updates:check', checkUpdates);
  ipcMain.handle('updates:download', async () => {
    if (!app.isPackaged || !updateAvailable || downloadingUpdate) throw new Error('Check for an available update before downloading.');
    if (process.platform === 'darwin' && releaseMode !== 'production') throw new Error('macOS updates require a signed production build.');
    downloadingUpdate = true;
    sendUpdateEvent({ type: 'download-progress', progress: { percent: 0 } });
    try { return await autoUpdater.downloadUpdate(); }
    finally { downloadingUpdate = false; }
  });
  ipcMain.handle('updates:quit-and-install', () => {
    if (!updateDownloaded) throw new Error('An update must finish downloading before installation.');
    autoUpdater.quitAndInstall(false, true);
  });
}

function showAbout() {
  void dialog.showMessageBox({
    type: 'info',
    title: 'About DailyCheck',
    message: `DailyCheck ${app.getVersion()}`,
    detail:
      'A local-first desktop checklist app for learning authentication, device authorization, installers, releases, and updates.'
  });
}

function configureMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'DailyCheck',
      submenu: [
        { label: 'About DailyCheck', click: showAbout },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => {
            void checkUpdates().catch((error: Error) => sendUpdateEvent({ type: 'error', message: error.message }));
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('dailycheck', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('dailycheck');
  }
  configureIpc();
  configureUpdater();
  configureMenu();
  await createWindow();
  if (pendingAuthCallback) {
    handleAuthCallback(pendingAuthCallback);
    pendingAuthCallback = null;
  }
  if (app.isPackaged) {
    void checkUpdates().catch((error: Error) => sendUpdateEvent({ type: 'error', message: error.message }));
  }
});

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const callbackUrl = argv.find((value) => value.startsWith('dailycheck://'));
    if (callbackUrl) handleAuthCallback(callbackUrl);
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleAuthCallback(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
