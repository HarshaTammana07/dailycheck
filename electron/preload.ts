import { contextBridge, ipcRenderer } from 'electron';

const updateListeners = new Set<(payload: unknown) => void>();
const authCallbackListeners = new Set<(url: string) => void>();

ipcRenderer.on('updates:event', (_event, payload) => {
  updateListeners.forEach((listener) => listener(payload));
});

ipcRenderer.on('auth:callback', (_event, url: string) => {
  authCallbackListeners.forEach((listener) => listener(url));
});

contextBridge.exposeInMainWorld('dailycheck', {
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  secureStorage: {
    getItem: (key: string) => ipcRenderer.invoke('secure-storage:get', key) as Promise<string | null>,
    setItem: (key: string, value: string) => ipcRenderer.invoke('secure-storage:set', key, value) as Promise<void>,
    removeItem: (key: string) => ipcRenderer.invoke('secure-storage:remove', key) as Promise<void>
  },
  device: {
    getInfo: () =>
      ipcRenderer.invoke('device:get-info') as Promise<{
        deviceIdHash: string;
        deviceName: string;
        operatingSystem: string;
        appVersion: string;
        platform: NodeJS.Platform;
      }>
  },
  updates: {
    getState: () => ipcRenderer.invoke('updates:state'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    quitAndInstall: () => ipcRenderer.invoke('updates:quit-and-install'),
    onEvent: (listener: (payload: unknown) => void) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    }
  },
  auth: {
    onCallback: (listener: (url: string) => void) => {
      authCallbackListeners.add(listener);
      return () => authCallbackListeners.delete(listener);
    }
  }
});
