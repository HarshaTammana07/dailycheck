import type { CompletionRecord, ExportPayload, TaskRecord, Weekday } from '../types';
import { completionId, validDateKey } from '../../supabase/functions/_shared/domain';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function timestamp(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid DailyCheck export record.');
  return value as Record<string, any>;
}
async function importedId(accountId: string, originalId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dailycheck-import:${accountId}:${originalId}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function validateTask(task: TaskRecord) {
  if (!uuid.test(task.id) || !task.accountId || typeof task.name !== 'string' || !task.name.trim() || task.name.length > 200
    || (task.description !== undefined && (typeof task.description !== 'string' || task.description.length > 4000))
    || typeof task.createdAt !== 'string' || !validDateKey(task.createdAt.slice(0, 10)) || !timestamp(task.updatedAt)
    || (task.archivedAt !== undefined && (typeof task.archivedAt !== 'string' || !validDateKey(task.archivedAt.slice(0, 10))))
    || task.recurrence?.frequency !== 'daily' || !Array.isArray(task.recurrence.weekdays) || !task.recurrence.weekdays.length
    || new Set(task.recurrence.weekdays).size !== task.recurrence.weekdays.length
    || task.recurrence.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Invalid task in export. Names, dates, IDs, and weekdays must be valid.');
}
export async function normalizeImport(accountId: string, value: unknown) {
  const payload = object(value) as ExportPayload;
  if (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1 || payload.schemaVersion > 3
    || typeof payload.accountId !== 'string' || !Array.isArray(payload.tasks) || !Array.isArray(payload.completions)
    || payload.tasks.length + payload.completions.length > 50_000) throw new Error('Unsupported or oversized DailyCheck export.');
  const ids = new Map<string, string>();
  const tasks: TaskRecord[] = [];
  for (const raw of payload.tasks) {
    const task = object(raw) as TaskRecord;
    if (task.accountId !== payload.accountId) throw new Error('Export contains mixed accounts.');
    validateTask(task);
    if (ids.has(task.id)) throw new Error('Export contains duplicate task IDs.');
    const id = payload.accountId === accountId ? task.id : await importedId(accountId, task.id);
    ids.set(task.id, id);
    tasks.push({ id, accountId, name: task.name.trim(), description: task.description?.trim() || undefined, createdAt: task.createdAt.slice(0, 10),
      updatedAt: task.updatedAt, archivedAt: task.archivedAt?.slice(0, 10), recurrence: { frequency: 'daily', weekdays: [...task.recurrence.weekdays] as Weekday[] } });
  }
  const completions: CompletionRecord[] = [];
  const completionIds = new Set<string>();
  for (const raw of payload.completions) {
    const row = object(raw) as CompletionRecord;
    const taskId = ids.get(row.taskId);
    if (row.accountId !== payload.accountId || !taskId || typeof row.date !== 'string' || !validDateKey(row.date)
      || typeof row.completed !== 'boolean' || typeof row.taskNameSnapshot !== 'string' || !row.taskNameSnapshot || row.taskNameSnapshot.length > 200
      || !timestamp(row.updatedAt) || (row.completedAt !== undefined && !timestamp(row.completedAt))) throw new Error('Invalid completion or missing task in export.');
    const id = completionId(accountId, taskId, row.date);
    if (completionIds.has(id)) throw new Error('Export contains duplicate completion records.');
    completionIds.add(id);
    completions.push({ id, accountId, taskId, date: row.date, completed: row.completed, taskNameSnapshot: row.taskNameSnapshot,
      updatedAt: row.updatedAt, completedAt: row.completedAt });
  }
  let preferences = payload.preferences;
  if (preferences && (!validDateKey(preferences.selectedDate) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(preferences.visibleMonth)
    || !['system', 'light', 'dark'].includes(preferences.theme) || !Number.isInteger(preferences.firstDayOfWeek)
    || preferences.firstDayOfWeek < 0 || preferences.firstDayOfWeek > 6)) throw new Error('Invalid preferences in export.');
  if (preferences) preferences = { ...preferences, accountId };
  return { tasks, completions, preferences };
}
export function sameRecord(a: unknown, b: unknown): boolean {
  function ordered(value: any): any {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, ordered(value[key])]));
    return value;
  }
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
