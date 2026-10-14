import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Laptop, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import type { RegisteredDevice } from '../types';
import { listRegisteredDevices, registerCurrentDevice, revokeDevice } from '../lib/deviceClient';

export default function DeviceGate({ session, onAuthorized }: { session: Session; onAuthorized: () => void }) {
  const [message, setMessage] = useState('Authorizing this installation...');
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loading, setLoading] = useState(true);

  async function authorize() {
    setLoading(true);
    const result = await registerCurrentDevice(session.user.id);
    if (result.status === 'authorized') {
      onAuthorized();
      return;
    }
    if (result.status === 'denied') {
      setDevices(result.devices);
      setMessage(result.reason);
    } else {
      setMessage(result.reason);
    }
    setLoading(false);
  }

  async function refreshDevices() {
    setDevices(await listRegisteredDevices());
  }

  async function revoke(id: string) {
    await revokeDevice(id);
    await refreshDevices();
    await authorize();
  }

  useEffect(() => {
    void authorize();
  }, []);

  return (
    <main className="center-screen px-6">
      <section className="device-panel">
        <div className="brand-lockup">
          <span className="brand-mark">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="eyebrow">Device authorization</p>
            <h1>{loading ? 'Checking this computer' : 'Choose a registered device to remove'}</h1>
          </div>
        </div>
        <p>{message}</p>
        <div className="device-list">
          {devices.map((device) => (
            <article key={device.id} className="device-row">
              <Laptop className="h-5 w-5" />
              <div>
                <strong>{device.device_name}</strong>
                <span>{device.operating_system}</span>
              </div>
              <button type="button" className="icon-button danger" aria-label="Revoke device" onClick={() => revoke(device.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
        <button type="button" className="secondary-button" onClick={authorize}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </section>
    </main>
  );
}
