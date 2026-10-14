/// <reference types="vite/client" />

type UpdateListener = (payload: unknown) => void;

interface DailyCheckBridge {
  platform: NodeJS.Platform;
  getAppVersion: () => Promise<string>;
  secureStorage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
  device: {
    getInfo: () => Promise<{
      deviceIdHash: string;
      deviceName: string;
      operatingSystem: string;
      appVersion: string;
      platform: NodeJS.Platform;
    }>;
  };
  updates: {
    getState: () => Promise<unknown>;
    check: () => Promise<unknown>;
    download: () => Promise<unknown>;
    quitAndInstall: () => Promise<unknown>;
    onEvent: (listener: UpdateListener) => () => void;
  };
  auth: {
    onCallback: (listener: (url: string) => void) => () => void;
  };
}

interface Window {
  dailycheck?: DailyCheckBridge;
}
