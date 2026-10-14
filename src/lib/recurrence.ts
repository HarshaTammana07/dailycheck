import type { CompletionRecord, DayChecklistItem, TaskRecord, Weekday } from '../types';
import { compareDateKeys, getWeekday } from './date';

export const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

export function defaultWeekdays(): Weekday[] {
  return [0, 1, 2, 3, 4, 5, 6];
}

export function isTaskScheduledOnDate(task: TaskRecord, dateKey: string) {
  if (compareDateKeys(task.createdAt.slice(0, 10), dateKey) > 0) return false;
  if (task.archivedAt && compareDateKeys(task.archivedAt.slice(0, 10), dateKey) < 0) return false;
  return task.recurrence.weekdays.includes(getWeekday(dateKey));
}

export function completionId(accountId: string, taskId: string, dateKey: string) {
  return `${accountId}:${taskId}:${dateKey}`;
}

export function getChecklistItemsForDate(tasks: TaskRecord[], completions: CompletionRecord[], dateKey: string): DayChecklistItem[] {
  const completionsByTask = new Map(completions.filter((item) => item.date === dateKey).map((item) => [item.taskId, item]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const items: DayChecklistItem[] = [];

  for (const task of tasks) {
    const scheduled = isTaskScheduledOnDate(task, dateKey);
    const completion = completionsByTask.get(task.id);
    if (scheduled || completion) {
      items.push({ task, completion, scheduled });
    }
  }

  for (const completion of completionsByTask.values()) {
    if (!taskById.has(completion.taskId)) {
      items.push({
        task: {
          id: completion.taskId,
          accountId: completion.accountId,
          name: completion.taskNameSnapshot,
          createdAt: completion.date,
          updatedAt: completion.updatedAt,
          archivedAt: completion.updatedAt,
          recurrence: { frequency: 'daily', weekdays: defaultWeekdays() }
        },
        completion,
        scheduled: false
      });
    }
  }

  return items.sort((a, b) => a.task.name.localeCompare(b.task.name));
}
