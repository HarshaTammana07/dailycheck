import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LogOut, Settings } from 'lucide-react';
import { useCallback } from 'react';
import AuthView from './components/AuthView';
import UpdateDialog from './components/UpdateDialog';
import CalendarMonth from './components/CalendarMonth';
import DayChecklist from './components/DayChecklist';
import DeviceGate from './components/DeviceGate';
import SettingsPanel from './components/SettingsPanel';
import TaskSidebar from './components/TaskSidebar';
import type { CompletionRecord, PreferencesRecord, TaskRecord } from './types';
import { daysInMonth, monthKeyFromDate, startOfMonth, toDateKey, todayKey } from './lib/date';
import { getPreferences, listCompletions, listTasks, savePreferences } from './lib/db';
import { summarizeMonth } from './lib/progress';
import { isSupabaseConfigured, supabase } from './lib/supabase';

function monthDateKeys(monthKey: string) {
  const start = startOfMonth(monthKey);
  return Array.from({ length: daysInMonth(monthKey) }, (_value, index) => {
    const date = new Date(start);
    date.setDate(index + 1);
    return toDateKey(date);
  });
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const dateKeys = useMemo(() => monthDateKeys(visibleMonth), [visibleMonth]);
  const summary = useMemo(() => summarizeMonth(tasks, completions, dateKeys), [tasks, completions, dateKeys]);

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
    <main className="app-shell">
      <aside className="sidebar">
        <TaskSidebar accountId={accountId!} tasks={tasks} onChanged={reloadData} />
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">DailyCheck</p>
            <h1>{summary.percent}% complete this month</h1>
          </div>
          <div className="topbar-actions">
            <span>{session.user.email}</span>
            <button className="icon-button" type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-5 w-5" />
            </button>
            <button className="icon-button" type="button" aria-label="Log out" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <CalendarMonth
          monthKey={visibleMonth}
          selectedDate={selectedDate}
          tasks={tasks}
          completions={completions}
          onMonthChange={(month) => updatePreferences({ visibleMonth: month })}
          onSelectDate={(date) => updatePreferences({ selectedDate: date, visibleMonth: date.slice(0, 7) })}
        />
        <section className="summary-strip">
          <div>
            <strong>{summary.daysTracked}</strong>
            <span>Tracked days</span>
          </div>
          <div>
            <strong>{summary.completedTasks}</strong>
            <span>Completed</span>
          </div>
          <div>
            <strong>{summary.missedTasks}</strong>
            <span>Open or missed</span>
          </div>
        </section>
      </section>
      <aside className="day-panel">
        <DayChecklist accountId={accountId!} dateKey={selectedDate} tasks={tasks} completions={completions} onChanged={reloadData} />
      </aside>
      {settingsOpen && (
        <SettingsPanel
          accountId={accountId!}
          session={session}
          onClose={() => setSettingsOpen(false)}
          onDataImported={reloadData}
        />
      )}
    </main>
  );
}
