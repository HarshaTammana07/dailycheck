import { describe, expect, it } from 'vitest';
import type { TaskRecord } from '../types';
import { getChecklistItemsForDate, isTaskScheduledOnDate } from '../lib/recurrence';

const baseTask: TaskRecord = {
  id: 'task-1',
  accountId: 'user-1',
  name: 'Read',
  createdAt: '2026-02-01',
  updatedAt: '2026-02-01T10:00:00.000Z',
  recurrence: { frequency: 'daily', weekdays: [1, 3, 5] }
};

describe('recurrence rules', () => {
  it('schedules selected weekdays only', () => {
    expect(isTaskScheduledOnDate(baseTask, '2026-02-02')).toBe(true);
    expect(isTaskScheduledOnDate(baseTask, '2026-02-03')).toBe(false);
  });

  it('keeps historical completion rows visible after a task is archived', () => {
    const archived: TaskRecord = { ...baseTask, archivedAt: '2026-02-10' };
    const items = getChecklistItemsForDate(
      [archived],
      [
        {
          id: 'user-1:task-1:2026-02-12',
          accountId: 'user-1',
          taskId: 'task-1',
          taskNameSnapshot: 'Read',
          date: '2026-02-12',
          completed: true,
          completedAt: '2026-02-12T10:00:00.000Z',
          updatedAt: '2026-02-12T10:00:00.000Z'
        }
      ],
      '2026-02-12'
    );

    expect(items).toHaveLength(1);
    expect(items[0].scheduled).toBe(false);
    expect(items[0].completion?.completed).toBe(true);
  });
});
