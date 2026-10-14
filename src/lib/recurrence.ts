import type { Weekday } from '../types';
export { defaultWeekdays, isTaskScheduledOnDate, completionId, getChecklistItemsForDate } from '../../supabase/functions/_shared/domain';
export const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }
];
