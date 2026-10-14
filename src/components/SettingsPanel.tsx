import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Download, HardDriveDownload, RefreshCw, Upload, X } from 'lucide-react';
import type { ExportPayload, RegisteredDevice } from '../types';
import { exportAccountData, importAccountData } from '../lib/db';
import { listRegisteredDevices } from '../lib/deviceClient';
import { ThemeSelector } from './ThemeProvider';
import { updatePercent, type UpdateState } from '../lib/updateState';

function updateStatus(state: UpdateState) {
  switch (state.type) {
    case 'checking': return 'Checking for a new version…';
    case 'not-available': return 'You’re up to date.';
    case 'available': return `Version ${state.info?.version ?? ''} is ready to download.`;
    case 'download-progress': return `Downloading update: ${updatePercent(state)}%`;
    case 'downloaded': return 'Your update is ready. Restart DailyCheck to install it.';
    case 'error': return state.message ?? 'The update check could not finish. Try again.';
    default: return state.message ?? 'DailyCheck checks for updates when you open it.';
  }
}

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
  const [updateState, setUpdateState] = useState<UpdateState>({ type: 'idle' });
  const [actionError, setActionError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.dailycheck?.getAppVersion().then(setVersion).catch(() => {});
    void listRegisteredDevices().then(setDevices).catch(() => setDevices([]));
    let receivedEvent = false;
    let mounted = true;
    const apply = (payload: unknown) => {
      if (mounted && payload && typeof payload === 'object') setUpdateState(payload as UpdateState);
    };
    const unsubscribe = window.dailycheck?.updates.onEvent(payload => { receivedEvent = true; apply(payload); });
    void window.dailycheck?.updates.getState().then(payload => { if (!receivedEvent) apply(payload); }).catch(() => {});
    return () => { mounted = false; unsubscribe?.(); };
  }, []);

  async function updateAction(action: 'check' | 'download' | 'quitAndInstall') {
    setActionError('');
    try { await window.dailycheck?.updates[action](); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'The update could not finish. Try again.'); }
  }

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
          <section className="appearance-section"><h3>Appearance</h3><p className="muted">Choose your look, or follow your computer’s theme.</p><ThemeSelector /></section>
          <section>
            <h3>Account</h3>
            <p>{session.user.email}</p>
            <p className="muted">Your tasks and history are saved on this computer for your account.</p>
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
            <p aria-live="polite">{actionError || updateStatus(updateState)}</p>
            <div className="button-row">
              <button type="button" className="secondary-button" disabled={['checking', 'download-progress', 'downloaded'].includes(updateState.type)} onClick={() => void updateAction('check')}>
                <RefreshCw className="h-4 w-4" />
                Check for updates
              </button>
              {updateState.type === 'available' && <button type="button" className="secondary-button" onClick={() => void updateAction('download')}>
                <HardDriveDownload className="h-4 w-4" />
                Download
              </button>}
              {updateState.type === 'downloaded' && <button type="button" className="primary-button" onClick={() => void updateAction('quitAndInstall')}>Restart and Install</button>}
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
