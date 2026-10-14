import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useCallback } from 'react';
import AuthView from './components/AuthView';
import UpdateDialog from './components/UpdateDialog';
import Dashboard from './components/Dashboard';
import DeviceGate from './components/DeviceGate';
import type { CompletionRecord, PreferencesRecord, TaskRecord } from './types';
import { monthKeyFromDate, todayKey } from './lib/date';
import { getPreferences, listCompletions, listTasks, savePreferences } from './lib/db';
import { isSupabaseConfigured, supabase } from './lib/supabase';

export default function App() {
  return <><AppContent /><UpdateDialog /></>;
}

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [deviceAuthorized, setDeviceAuthorized] = useState(false);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [preferences, setPreferences] = useState<PreferencesRecord | null>(null);
  const accountId = session?.user.id;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setDeviceAuthorized(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    return window.dailycheck?.auth.onCallback((callbackUrl) => {
      const parsed = new URL(callbackUrl);
      const code = parsed.searchParams.get('code');
      if (code) {
        void supabase.auth.exchangeCodeForSession(code);
      }
    });
  }, []);

  const reloadData = useCallback(async () => {
    if (!accountId) return;
    const [nextTasks, nextCompletions, nextPreferences] = await Promise.all([
      listTasks(accountId),
      listCompletions(accountId),
      getPreferences(accountId)
    ]);
    setTasks(nextTasks);
    setCompletions(nextCompletions);
    setPreferences(nextPreferences);
  }, [accountId]);

  useEffect(() => {
    if (!accountId || !deviceAuthorized) return;
    void reloadData();
  }, [accountId, deviceAuthorized, reloadData]);

  const visibleMonth = preferences?.visibleMonth ?? monthKeyFromDate(new Date());
  const selectedDate = preferences?.selectedDate ?? todayKey();

  async function updatePreferences(patch: Partial<PreferencesRecord>) {
    if (!accountId) return;
    const base = preferences ?? (await getPreferences(accountId));
    const next = { ...base, ...patch };
    setPreferences(next);
    await savePreferences(next);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (!authReady) {
    return <div className="center-screen">Opening DailyCheck...</div>;
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="center-screen px-6">
        <div className="setup-panel">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <h1>DailyCheck is ready for your Supabase project.</h1>
          <p>
            Copy <code>.env.example</code> to <code>.env</code>, add your Supabase URL and public anon key, then restart the
            dev server. The app intentionally does not fall back to fake authentication.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthView />;
  }

  if (!deviceAuthorized) {
    return <DeviceGate session={session} onAuthorized={() => setDeviceAuthorized(true)} />;
  }

  return (
    <Dashboard session={session} tasks={tasks} completions={completions} visibleMonth={visibleMonth} selectedDate={selectedDate}
      onMonthChange={(month) => { void updatePreferences({ visibleMonth: month }); }}
      onSelectDate={(date) => { void updatePreferences({ selectedDate: date, visibleMonth: date.slice(0, 7) }); }}
      onChanged={reloadData} onLogout={handleLogout} />
  );
}
