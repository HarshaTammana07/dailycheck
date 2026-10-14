import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Download, HardDriveDownload, RefreshCw, Upload, X } from 'lucide-react';
import type { ExportPayload, RegisteredDevice } from '../types';
import { exportAccountData, importAccountData } from '../lib/db';
import { listRegisteredDevices } from '../lib/deviceClient';

export default function SettingsPanel({
  accountId,
  session,
  onClose,
  onDataImported
}: {
  accountId: string;
  session: Session;
  onClose: () => void;
  onDataImported: () => void;
}) {
  const [version, setVersion] = useState('development');
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [updateMessage, setUpdateMessage] = useState('Updates are checked automatically in packaged builds.');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.dailycheck?.getAppVersion().then(setVersion);
    void listRegisteredDevices().then(setDevices).catch(() => setDevices([]));
    return window.dailycheck?.updates.onEvent((payload) => {
      const event = payload as { type?: string; message?: string; progress?: { percent?: number } };
      if (event.type === 'download-progress') {
        setUpdateMessage(`Downloading update: ${Math.round(event.progress?.percent ?? 0)}%`);
      } else if (event.type) {
        setUpdateMessage(event.message ?? `Update status: ${event.type}`);
      }
    });
  }, []);

  async function exportJson() {
    const payload = await exportAccountData(accountId);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `dailycheck-export-${accountId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    const payload = JSON.parse(await file.text()) as ExportPayload;
    await importAccountData(accountId, payload);
    onDataImported();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <section className="settings-panel">
        <header className="settings-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>DailyCheck {version}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="settings-grid">
          <section>
            <h3>Account</h3>
            <p>{session.user.email}</p>
            <p className="muted">Local task data is scoped by this Supabase user ID.</p>
          </section>
          <section>
            <h3>Data</h3>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={exportJson}>
                <Download className="h-4 w-4" />
                Export JSON
              </button>
              <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Import JSON
              </button>
            </div>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importJson(file);
              }}
            />
          </section>
          <section>
            <h3>Updates</h3>
            <p>{updateMessage}</p>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={() => window.dailycheck?.updates.check()}>
                <RefreshCw className="h-4 w-4" />
                Check
              </button>
              <button type="button" className="secondary-button" onClick={() => window.dailycheck?.updates.download()}>
                <HardDriveDownload className="h-4 w-4" />
                Download
              </button>
            </div>
          </section>
          <section>
            <h3>Registered devices</h3>
            <div className="device-list compact">
              {devices.map((device) => (
                <article key={device.id} className="device-row">
                  <div>
                    <strong>{device.device_name}</strong>
                    <span>{device.operating_system}</span>
                  </div>
                </article>
              ))}
              {devices.length === 0 && <p className="muted">No devices returned by the backend yet.</p>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
