import { useMemo, useState } from 'react';
import { Archive, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import type { TaskRecord, Weekday } from '../types';
import { archiveTask, deleteTask, saveTask } from '../lib/db';
import { defaultWeekdays, WEEKDAYS } from '../lib/recurrence';

export default function TaskSidebar({ accountId, tasks, onChanged }: { accountId: string; tasks: TaskRecord[]; onChanged: () => void }) {
  const active = useMemo(() => tasks.filter((task) => !task.archivedAt), [tasks]);
  const archived = useMemo(() => tasks.filter((task) => task.archivedAt), [tasks]);
  const [editing, setEditing] = useState<TaskRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weekdays, setWeekdays] = useState<Weekday[]>(defaultWeekdays());

  function beginEdit(task: TaskRecord) {
    setEditing(task);
    setName(task.name);
    setDescription(task.description ?? '');
    setWeekdays(task.recurrence.weekdays);
  }

  function resetForm() {
    setEditing(null);
    setName('');
    setDescription('');
    setWeekdays(defaultWeekdays());
  }

  function toggleWeekday(day: Weekday) {
    setWeekdays((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort()));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await saveTask({
      accountId,
      id: editing?.id,
      name,
      description,
      weekdays
    });
    resetForm();
    onChanged();
  }

  async function handleArchive(task: TaskRecord) {
    await archiveTask(task.id);
    onChanged();
  }

  async function handleDelete(task: TaskRecord) {
    await deleteTask(task.id);
    onChanged();
  }

  return (
    <div className="sidebar-inner">
      <div>
        <p className="eyebrow">Tasks</p>
        <h2>{active.length} active</h2>
      </div>
      <form className="task-form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Hydrate, read, stretch..." />
        </label>
        <label>
          Notes
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
        </label>
        <div className="weekday-pills" aria-label="Recurring weekdays">
          {WEEKDAYS.map((weekday) => (
            <button
              key={weekday.value}
              type="button"
              className={weekdays.includes(weekday.value) ? 'active' : ''}
              onClick={() => toggleWeekday(weekday.value)}
            >
              {weekday.label}
            </button>
          ))}
        </div>
        <div className="form-actions">
          <button className="primary-button" type="submit">
            {editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editing ? 'Save' : 'Add task'}
          </button>
          {editing && (
            <button className="secondary-button" type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="task-list">
        {active.map((task) => (
          <article key={task.id} className="task-row">
            <div>
              <strong>{task.name}</strong>
              <span>{task.recurrence.weekdays.length === 7 ? 'Daily' : task.recurrence.weekdays.map((day) => WEEKDAYS[day].label).join(', ')}</span>
            </div>
            <div className="row-actions">
              <button type="button" className="icon-button" aria-label="Edit task" onClick={() => beginEdit(task)}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" className="icon-button" aria-label="Archive task" onClick={() => handleArchive(task)}>
                <Archive className="h-4 w-4" />
              </button>
              <button type="button" className="icon-button danger" aria-label="Delete task" onClick={() => handleDelete(task)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </div>
      {archived.length > 0 && (
        <details className="archive-list">
          <summary>{archived.length} archived</summary>
          {archived.map((task) => (
            <span key={task.id}>{task.name}</span>
          ))}
        </details>
      )}
    </div>
  );
}
