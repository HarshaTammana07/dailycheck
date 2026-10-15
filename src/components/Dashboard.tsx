import type { Session } from '@supabase/supabase-js';
import { useMemo, useState } from 'react';
import { CalendarDays, CheckCheck, CheckCircle2, LogOut, Settings, TrendingUp } from 'lucide-react';
import type { CompletionRecord, TaskRecord } from '../types';
import { daysInMonth, startOfMonth, toDateKey } from '../lib/date';
import { summarizeMonth } from '../lib/progress';
import CalendarMonth from './CalendarMonth';
import DayChecklist from './DayChecklist';
import TaskSidebar from './TaskSidebar';
import SettingsPanel from './SettingsPanel';
import { ThemeToggle } from './ThemeProvider';

export default function Dashboard({ session, tasks, completions, visibleMonth, selectedDate, onMonthChange, onSelectDate, onChanged, onLogout }: {
  session: Session;
  tasks: TaskRecord[];
  completions: CompletionRecord[];
  visibleMonth: string;
  selectedDate: string;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  onChanged: () => void;
  onLogout: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const summary = useMemo(() => {
    const dates = Array.from({ length: daysInMonth(visibleMonth) }, (_, index) => {
      const date = startOfMonth(visibleMonth);
      date.setDate(index + 1);
      return toDateKey(date);
    });
    return summarizeMonth(tasks, completions, dates);
  }, [tasks, completions, visibleMonth]);

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><span className="brand-mark"><CheckCircle2 size={22} /></span>
        <div><strong>DailyCheck</strong><span>Small steps. Every day.</span></div></div>
      <TaskSidebar accountId={session.user.id} tasks={tasks} onChanged={onChanged} />
      <div className="sidebar-footer"><span className="status-dot" /> Your routine, one day at a time</div>
    </aside>
    <section className="workspace">
      <header className="topbar">
        <div><p className="eyebrow">Your daily rhythm</p><h1>A little progress, every day.</h1></div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-button" type="button" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
          <button className="icon-button" type="button" aria-label="Log out" title="Log out" onClick={onLogout}><LogOut size={18} /></button>
        </div>
      </header>
      <section className="summary-strip" aria-label="Month summary">
        <div className="summary-card progress-card"><span className="stat-label"><TrendingUp size={16} /> Month progress</span>
          <strong>{summary.percent}<small>%</small></strong><div className="mini-progress" role="progressbar" aria-label="Month completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percent}><span style={{ width: `${summary.percent}%` }} /></div></div>
        <div className="summary-card"><span className="stat-label"><CheckCheck size={16} /> Tasks completed</span><strong>{summary.completedTasks}<small> / {summary.totalTasks}</small></strong><p>Each check is a step forward</p></div>
        <div className="summary-card"><span className="stat-label"><CalendarDays size={16} /> Scheduled days</span><strong>{summary.daysTracked}<small> days</small></strong><p>Your routine this month</p></div>
      </section>
      <CalendarMonth monthKey={visibleMonth} selectedDate={selectedDate} tasks={tasks} completions={completions} onMonthChange={onMonthChange} onSelectDate={onSelectDate} />
      <div className="calendar-legend"><span><i className="legend-dot" /> Completed</span><span><i className="legend-dot pending" /> In progress</span><span className="legend-hint">Choose a day to view your checklist</span></div>
    </section>
    <aside className="day-panel">
      <DayChecklist accountId={session.user.id} dateKey={selectedDate} tasks={tasks} completions={completions} onChanged={onChanged} />
      <div className="account-chip"><span className="avatar">{session.user.email?.charAt(0).toUpperCase() ?? 'D'}</span><div><strong>Your account</strong><span title={session.user.email}>{session.user.email}</span></div></div>
    </aside>
    {settingsOpen && <SettingsPanel accountId={session.user.id} session={session} onClose={() => setSettingsOpen(false)} onDataImported={onChanged} />}
  </main>;
}
