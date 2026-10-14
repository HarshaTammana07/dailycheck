import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CompletionRecord, TaskRecord } from '../types';
import { calculateDayProgress } from '../lib/progress';
import { daysInMonth, formatMonth, parseDateKey, shiftMonth, startOfMonth, toDateKey } from '../lib/date';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarMonth({
  monthKey,
  selectedDate,
  tasks,
  completions,
  onMonthChange,
  onSelectDate
}: {
  monthKey: string;
  selectedDate: string;
  tasks: TaskRecord[];
  completions: CompletionRecord[];
  onMonthChange: (monthKey: string) => void;
  onSelectDate: (dateKey: string) => void;
}) {
  const start = startOfMonth(monthKey);
  const leadingBlanks = start.getDay();
  const days = Array.from({ length: daysInMonth(monthKey) }, (_value, index) => {
    const date = new Date(start);
    date.setDate(index + 1);
    const dateKey = toDateKey(date);
    return { date, dateKey, progress: calculateDayProgress(tasks, completions, dateKey) };
  });

  return (
    <section className="calendar-section">
      <div className="calendar-header">
        <div><p className="eyebrow">Month at a glance</p><h2>{formatMonth(monthKey)}</h2></div>
        <div className="calendar-nav">
        <button className="secondary-button today-button" type="button" onClick={() => onSelectDate(toDateKey(new Date()))}>Today</button>
        <button className="icon-button" type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(monthKey, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button className="icon-button" type="button" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(monthKey, 1))}>
          <ChevronRight className="h-5 w-5" />
        </button>
        </div>
      </div>
      <div className="calendar-grid weekday-grid">
        {weekdayLabels.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-grid day-grid">
        {Array.from({ length: leadingBlanks }, (_value, index) => (
          <span key={`blank-${index}`} className="day-cell empty" />
        ))}
        {days.map(({ date, dateKey, progress }) => {
          const selected = dateKey === selectedDate;
          const today = dateKey === toDateKey(new Date());
          const stale = parseDateKey(dateKey).getTime() < new Date(new Date().toDateString()).getTime();
          return (
            <button
              key={dateKey}
              type="button"
              className={`day-cell ${selected ? 'selected' : ''} ${today ? 'today' : ''} ${stale ? 'past' : ''}`}
              aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}, ${progress.completed} of ${progress.total} tasks completed`}
              aria-pressed={selected}
              onClick={() => onSelectDate(dateKey)}
            >
              <span className="day-number">{date.getDate()}</span>
              {progress.total > 0 && <span className="progress-ring" aria-hidden="true" style={{ ['--progress' as string]: `${progress.percent}%` }} />}
              <span className={`day-meta ${progress.total > 0 && progress.percent === 100 ? 'all-done' : ''}`}>{progress.total ? `${progress.completed} / ${progress.total} done` : '—'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
