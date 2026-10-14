import { CheckCircle2, Circle } from 'lucide-react';
import type { CompletionRecord, TaskRecord } from '../types';
import { formatShortDate } from '../lib/date';
import { setCompletion } from '../lib/db';
import { getChecklistItemsForDate } from '../lib/recurrence';

export default function DayChecklist({
  accountId,
  dateKey,
  tasks,
  completions,
  onChanged
}: {
  accountId: string;
  dateKey: string;
  tasks: TaskRecord[];
  completions: CompletionRecord[];
  onChanged: () => void;
}) {
  const items = getChecklistItemsForDate(tasks, completions, dateKey);
  const completedCount = items.filter(item => item.completion?.completed).length;

  async function toggle(task: TaskRecord, completed: boolean) {
    await setCompletion(accountId, task, dateKey, !completed);
    onChanged();
  }

  return (
    <div className="day-panel-inner">
      <div>
        <p className="eyebrow">Selected day</p>
        <h2>{formatShortDate(dateKey)}</h2>
      </div>
      <div className="day-progress"><span>{completedCount} of {items.length} completed</span>
        <div className="mini-progress"><span style={{ width: `${items.length ? completedCount / items.length * 100 : 0}%` }} /></div></div>
      <div className="checklist">
        {items.length === 0 && <p className="empty-state">No tasks are scheduled for this day.</p>}
        {items.map(({ task, completion, scheduled }) => {
          const completed = Boolean(completion?.completed);
          return (
            <button key={task.id} type="button" className={`check-row ${completed ? 'complete' : ''}`} aria-pressed={completed} onClick={() => toggle(task, completed)}>
              {completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              <span>
                <strong>{task.name}</strong>
                <small>{completed ? 'Completed' : scheduled ? 'Ready when you are' : 'Historical record'}</small>
                {task.description && <small className="task-description">{task.description}</small>}
              </span>
            </button>
          );
        })}
      </div>
      {items.length > 0 && completedCount === items.length && <div className="day-celebration"><CheckCircle2 size={24} /><strong>All done for this day.</strong><p>A small win worth keeping.</p></div>}
    </div>
  );
}
