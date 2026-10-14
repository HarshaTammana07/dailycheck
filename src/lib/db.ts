import Dexie, { type Table } from 'dexie';
import type { CompletionRecord, DeviceLeaseRecord, ExportPayload, PreferencesRecord, TaskRecord, Weekday } from '../types';
import { monthKeyFromDate, todayKey } from './date';
import { completionId, defaultWeekdays } from './recurrence';

const SCHEMA_VERSION = 2;

class DailyCheckDatabase extends Dexie {
  tasks!: Table<TaskRecord, string>;
  completions!: Table<CompletionRecord, string>;
  preferences!: Table<PreferencesRecord, string>;
  deviceLeases!: Table<DeviceLeaseRecord, string>;

  constructor() {
    super('dailycheck');
    this.version(1).stores({
      tasks: 'id, accountId, archivedAt, createdAt',
      completions: 'id, accountId, taskId, date, [accountId+date], [accountId+taskId+date]',
      preferences: 'accountId'
    });
    this.version(2).stores({
      tasks: 'id, accountId, archivedAt, createdAt',
      completions: 'id, accountId, taskId, date, [accountId+date], [accountId+taskId+date]',
      preferences: 'accountId',
      deviceLeases: '&userId, authorizedUntil'
    });
  }
}

export const db = new DailyCheckDatabase();
export const schemaVersion = SCHEMA_VERSION;

export async function listTasks(accountId: string) {
  return db.tasks.where('accountId').equals(accountId).sortBy('createdAt');
}

export async function activeTasks(accountId: string) {
  const tasks = await listTasks(accountId);
  return tasks.filter((task) => !task.archivedAt);
}

export async function saveTask(input: {
  accountId: string;
  id?: string;
  name: string;
  description?: string;
  weekdays: Weekday[];
}) {
  const now = new Date().toISOString();
  const existing = input.id ? await db.tasks.get(input.id) : undefined;
  const task: TaskRecord = {
    id: input.id ?? crypto.randomUUID(),
    accountId: input.accountId,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    createdAt: existing?.createdAt ?? todayKey(),
    updatedAt: now,
    archivedAt: existing?.archivedAt,
    recurrence: {
      frequency: 'daily',
      weekdays: input.weekdays.length ? input.weekdays : defaultWeekdays()
    }
  };
  await db.tasks.put(task);
  return task;
}

export async function archiveTask(id: string) {
  const task = await db.tasks.get(id);
  if (!task) return;
  await db.tasks.put({ ...task, archivedAt: todayKey(), updatedAt: new Date().toISOString() });
}

export async function deleteTask(id: string) {
  await db.transaction('rw', db.tasks, db.completions, async () => {
    await db.tasks.delete(id);
    await db.completions.where('taskId').equals(id).delete();
  });
}

export async function listCompletions(accountId: string) {
  return db.completions.where('accountId').equals(accountId).toArray();
}

export async function listCompletionsForMonth(accountId: string, monthKey: string) {
  const prefix = `${monthKey}-`;
  const completions = await listCompletions(accountId);
  return completions.filter((completion) => completion.date.startsWith(prefix));
}

export async function setCompletion(accountId: string, task: TaskRecord, dateKey: string, completed: boolean) {
  const now = new Date().toISOString();
  const record: CompletionRecord = {
    id: completionId(accountId, task.id, dateKey),
    accountId,
    taskId: task.id,
    taskNameSnapshot: task.name,
    date: dateKey,
    completed,
    completedAt: completed ? now : undefined,
    updatedAt: now
  };
  await db.completions.put(record);
  return record;
}

export async function getPreferences(accountId: string): Promise<PreferencesRecord> {
  const existing = await db.preferences.get(accountId);
  if (existing) return existing;
  const selectedDate = todayKey();
  return {
    accountId,
    selectedDate,
    visibleMonth: monthKeyFromDate(new Date()),
    firstDayOfWeek: 0,
    theme: 'system'
  };
}

export async function savePreferences(preferences: PreferencesRecord) {
  await db.preferences.put(preferences);
}

export async function saveDeviceLease(lease: DeviceLeaseRecord) {
  await db.deviceLeases.put(lease);
}

export async function getDeviceLease(userId: string) {
  return db.deviceLeases.get(userId);
}

export async function exportAccountData(accountId: string): Promise<ExportPayload> {
  const [tasks, completions, preferences] = await Promise.all([
    listTasks(accountId),
    listCompletions(accountId),
    db.preferences.get(accountId)
  ]);
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    accountId,
    tasks,
    completions,
    preferences
  };
}

export async function importAccountData(accountId: string, payload: ExportPayload) {
  if (!Array.isArray(payload.tasks) || !Array.isArray(payload.completions)) {
    throw new Error('Invalid DailyCheck export file.');
  }
  await db.transaction('rw', db.tasks, db.completions, db.preferences, async () => {
    await db.tasks.bulkPut(payload.tasks.map((task) => ({ ...task, accountId })));
    await db.completions.bulkPut(payload.completions.map((completion) => ({ ...completion, accountId })));
    if (payload.preferences) {
      await db.preferences.put({ ...payload.preferences, accountId });
    }
  });
}
