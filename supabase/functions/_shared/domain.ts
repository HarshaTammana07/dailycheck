// Pure calendar rules shared by the desktop and MCP server. No network or storage access.
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface DomainTask {
  id: string; accountId: string; name: string; description?: string; createdAt: string; updatedAt: string;
  archivedAt?: string; recurrence: { frequency: 'daily'; weekdays: Weekday[] };
}
export interface DomainCompletion {
  id: string; accountId: string; taskId: string; taskNameSnapshot: string; date: string; completed: boolean;
  completedAt?: string; updatedAt: string;
}
export function defaultWeekdays(): Weekday[] { return [0, 1, 2, 3, 4, 5, 6]; }
export function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isTaskScheduledOnDate(task: DomainTask, dateKey: string) {
  return task.createdAt.slice(0, 10) <= dateKey && (!task.archivedAt || task.archivedAt.slice(0, 10) >= dateKey)
    && task.recurrence.weekdays.includes(new Date(`${dateKey}T12:00:00Z`).getUTCDay() as Weekday);
}
export function completionId(accountId: string, taskId: string, date: string) { return `${accountId}:${taskId}:${date}`; }
export function getChecklistItemsForDate(tasks: DomainTask[], completions: DomainCompletion[], date: string) {
  const byTask = new Map(completions.filter(row => row.date === date).map(row => [row.taskId, row]));
  const items: { task: DomainTask; completion?: DomainCompletion; scheduled: boolean }[] = [];
  for (const task of tasks) {
    const scheduled = isTaskScheduledOnDate(task, date);
    const completion = byTask.get(task.id);
    if (scheduled || completion) items.push({ task, completion, scheduled });
  }
  const ids = new Set(tasks.map(task => task.id));
  for (const completion of byTask.values()) if (!ids.has(completion.taskId)) items.push({ task: {
    id: completion.taskId, accountId: completion.accountId, name: completion.taskNameSnapshot, createdAt: completion.date,
    updatedAt: completion.updatedAt, archivedAt: completion.updatedAt, recurrence: { frequency: 'daily', weekdays: defaultWeekdays() }
  }, completion, scheduled: false });
  return items.sort((a, b) => a.task.name.localeCompare(b.task.name));
}
export function calculateDayProgress(tasks: DomainTask[], completions: DomainCompletion[], date: string) {
  const items = getChecklistItemsForDate(tasks, completions, date);
  const completed = items.filter(item => item.completion?.completed).length;
  return { total: items.length, completed, percent: items.length ? Math.round(completed / items.length * 100) : 0 };
}
export function summarizeMonth(tasks: DomainTask[], completions: DomainCompletion[], dateKeys: string[]) {
  const daily = dateKeys.map(dateKey => ({ dateKey, ...calculateDayProgress(tasks, completions, dateKey) }));
  const totalTasks = daily.reduce((sum, day) => sum + day.total, 0);
  const completedTasks = daily.reduce((sum, day) => sum + day.completed, 0);
  return { totalTasks, completedTasks, missedTasks: totalTasks - completedTasks,
    daysTracked: daily.filter(day => day.total > 0).length,
    percent: totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0, daily };
}
