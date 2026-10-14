import { useEffect, useState } from 'react';
import { releaseNotesText, updatePercent, type UpdateState } from '../lib/updateState';

export default function UpdateDialog() {
  const [state, setState] = useState<UpdateState>({ type: 'idle' });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let receivedEvent = false;
    let mounted = true;
    const apply = (payload: unknown) => {
      if (!mounted || !payload || typeof payload !== 'object') return;
      const next = payload as UpdateState;
      setState(next);
      if (['available', 'downloaded', 'error'].includes(next.type)) setOpen(true);
    };
    const unsubscribe = window.dailycheck?.updates.onEvent(payload => { receivedEvent = true; apply(payload); });
    void window.dailycheck?.updates.getState().then(payload => { if (!receivedEvent) apply(payload); });
    return () => { mounted = false; unsubscribe?.(); };
  }, []);
  async function act(action: 'download' | 'quitAndInstall') {
    try { await window.dailycheck?.updates[action](); }
    catch (error) { setState(previous => ({ ...previous, type: 'error', message: String(error) })); setOpen(true); }
  }
  if (!open) return null;
  const downloading = state.type === 'download-progress';
  const downloaded = state.type === 'downloaded';
  return (
    <div className="modal-backdrop update-backdrop" role="dialog" aria-modal="true" aria-label="Application update">
      <section className="settings-panel update-panel">
        <p className="eyebrow">DailyCheck update</p>
        <h2>{state.type === 'error' ? 'Update could not finish' : downloaded ? 'Ready to install' : `Version ${state.info?.version ?? ''}`}</h2>
        {state.releaseMode === 'development' && <p className="notice">Development update: publisher signing is not configured.</p>}
        {state.type === 'error' ? <p role="alert">{state.message}</p> : <pre className="release-notes">{releaseNotesText(state)}</pre>}
        {downloading && <><progress max={100} value={updatePercent(state)} /><p>Downloading: {updatePercent(state)}%</p></>}
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={() => setOpen(false)}>{downloading ? 'Hide' : 'Later'}</button>
          {state.type === 'available' && <button type="button" className="primary-button" onClick={() => void act('download')}>Download Update</button>}
          {downloaded && <button type="button" className="primary-button" onClick={() => void act('quitAndInstall')}>Restart and Install</button>}
        </div>
      </section>
    </div>
  );
}
