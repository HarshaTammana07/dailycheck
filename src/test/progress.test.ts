import { describe, expect, it } from 'vitest';
import type { CompletionRecord, TaskRecord } from '../types';
import { calculateDayProgress, summarizeMonth } from '../lib/progress';

const tasks: TaskRecord[] = [
  {
    id: 'a',
    accountId: 'user-1',
    name: 'A',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00.000Z',
    recurrence: { frequency: 'daily', weekdays: [1] }
  },
  {
    id: 'b',
    accountId: 'user-1',
    name: 'B',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00.000Z',
    recurrence: { frequency: 'daily', weekdays: [1] }
  }
];

const completions: CompletionRecord[] = [
  {
    id: 'user-1:a:2026-01-05',
    accountId: 'user-1',
    taskId: 'a',
    taskNameSnapshot: 'A',
    date: '2026-01-05',
    completed: true,
    completedAt: '2026-01-05T12:00:00.000Z',
    updatedAt: '2026-01-05T12:00:00.000Z'
  }
];

describe('progress calculations', () => {
  it('calculates daily completion percentage', () => {
    expect(calculateDayProgress(tasks, completions, '2026-01-05')).toEqual({ total: 2, completed: 1, percent: 50 });
  });

  it('summarizes a month from daily progress', () => {
    const summary = summarizeMonth(tasks, completions, ['2026-01-05', '2026-01-06']);
    expect(summary.completedTasks).toBe(1);
    expect(summary.missedTasks).toBe(1);
    expect(summary.percent).toBe(50);
  });
});
