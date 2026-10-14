import type { CompletionRecord, DayProgress, TaskRecord } from '../types';
import { getChecklistItemsForDate } from './recurrence';

export function calculateDayProgress(tasks: TaskRecord[], completions: CompletionRecord[], dateKey: string): DayProgress {
  const items = getChecklistItemsForDate(tasks, completions, dateKey);
  const total = items.length;
  const completed = items.filter((item) => item.completion?.completed).length;
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}

export function summarizeMonth(tasks: TaskRecord[], completions: CompletionRecord[], dateKeys: string[]) {
  const daily = dateKeys.map((dateKey) => ({ dateKey, ...calculateDayProgress(tasks, completions, dateKey) }));
  const totalTasks = daily.reduce((sum, day) => sum + day.total, 0);
  const completedTasks = daily.reduce((sum, day) => sum + day.completed, 0);
  const missedTasks = daily.reduce((sum, day) => sum + Math.max(day.total - day.completed, 0), 0);
  return {
    daysTracked: daily.filter((day) => day.total > 0).length,
    totalTasks,
    completedTasks,
    missedTasks,
    percent: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    daily
  };
}
