import Dexie, { type Table } from 'dexie';
import type { CompletionRecord, DeviceLeaseRecord, ExportPayload, PreferencesRecord, TaskRecord, Weekday } from '../types';
import { monthKeyFromDate, todayKey } from './date';
import { completionId, defaultWeekdays } from './recurrence';
import { type CloudVersion, type OutboxOperation, type SyncState, type EntityKind, versionKey, withoutAccount } from './cloudTypes';
import { normalizeImport, sameRecord } from './importData';

const SCHEMA_VERSION = 3;

class DailyCheckDatabase extends Dexie {
  tasks!: Table<TaskRecord, string>;
  completions!: Table<CompletionRecord, string>;
  preferences!: Table<PreferencesRecord, string>;
  deviceLeases!: Table<DeviceLeaseRecord, string>;
  syncStates!: Table<SyncState, string>;
  outbox!: Table<OutboxOperation, number>;
  cloudVersions!: Table<CloudVersion, string>;

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
    this.version(3).stores({
      tasks: 'id, accountId, archivedAt, createdAt',
      completions: 'id, accountId, taskId, date, [accountId+date], [accountId+taskId+date]',
      preferences: 'accountId',
      deviceLeases: '&userId, authorizedUntil',
      syncStates: 'accountId',
      outbox: '++sequence, &operationId, accountId, [accountId+kind+entityId]',
      cloudVersions: '&key, accountId'
    });
  }
}

export const db = new DailyCheckDatabase();
export const schemaVersion = SCHEMA_VERSION;

export async function enqueueChange(accountId: string, kind: EntityKind, record: TaskRecord | CompletionRecord, deleted = false) {
  if (!(await db.syncStates.get(accountId))) return;
  const version = await db.cloudVersions.get(versionKey(accountId, kind, record.id));
  await db.outbox.add({ operationId: crypto.randomUUID(), accountId, kind, entityId: record.id,
    payload: withoutAccount(record), deleted, expectedRevision: version?.revision ?? 0, status: 'pending' });
}

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
  expectedUpdatedAt?: string;
}) {
  const now = new Date().toISOString();
  if (!input.name.trim() || input.name.trim().length > 200 || (input.description?.length ?? 0) > 4000
    || input.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Invalid task fields.');
  const existing = input.id ? await db.tasks.get(input.id) : undefined;
  if (input.id && input.expectedUpdatedAt && !existing) throw new Error('This task was deleted while you were editing it.');
  if (existing && existing.accountId !== input.accountId) throw new Error('Task belongs to another account.');
  if (existing && input.expectedUpdatedAt && existing.updatedAt !== input.expectedUpdatedAt) throw new Error('This task changed while you were editing it. Open Edit again to review the latest version.');
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
  await db.transaction('rw', db.tasks, db.syncStates, db.outbox, db.cloudVersions, async () => {
    const latest = await db.tasks.get(task.id);
    if ((latest?.updatedAt ?? null) !== (existing?.updatedAt ?? null)) throw new Error('This task changed while you were editing it. Try again.');
    await db.tasks.put(task);
    await enqueueChange(input.accountId, 'task', task);
  });
  return task;
}

export async function archiveTask(id: string, accountId: string) {
  await db.transaction('rw', db.tasks, db.syncStates, db.outbox, db.cloudVersions, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    if (task.accountId !== accountId) throw new Error('Task belongs to another account.');
    const next = { ...task, archivedAt: todayKey(), updatedAt: new Date().toISOString() };
    await db.tasks.put(next);
    await enqueueChange(task.accountId, 'task', next);
  });
}

export async function deleteTask(id: string, accountId: string) {
  await db.transaction('rw', db.tasks, db.completions, db.syncStates, db.outbox, db.cloudVersions, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    if (task.accountId !== accountId) throw new Error('Task belongs to another account.');
    await enqueueChange(task.accountId, 'task', task, true);
    await db.tasks.delete(id);
    await db.completions.where('[accountId+taskId+date]').between([accountId, id, ''], [accountId, id, '\uffff']).delete();
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
  if (task.accountId !== accountId) throw new Error('Task belongs to another account.');
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
  await db.transaction('rw', db.completions, db.syncStates, db.outbox, db.cloudVersions, async () => {
    await db.completions.put(record);
    await enqueueChange(accountId, 'completion', record);
  });
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
  const normalized = await normalizeImport(accountId, payload);
  await db.transaction('rw', [db.tasks, db.completions, db.preferences, db.syncStates, db.outbox, db.cloudVersions], async () => {
    for (const task of normalized.tasks) {
      const existing = await db.tasks.get(task.id);
      if (existing && existing.accountId !== accountId) throw new Error('Task ID collision with another account.');
      if (!sameRecord(existing, task)) { await db.tasks.put(task); await enqueueChange(accountId, 'task', task); }
    }
    for (const row of normalized.completions) if (!sameRecord(await db.completions.get(row.id), row)) {
      await db.completions.put(row); await enqueueChange(accountId, 'completion', row);
    }
    if (normalized.preferences) await db.preferences.put(normalized.preferences);
  });
}
