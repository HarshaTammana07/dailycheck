export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RecurrenceRule = {
  frequency: 'daily';
  weekdays: Weekday[];
};

export type TaskRecord = {
  id: string;
  accountId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  recurrence: RecurrenceRule;
};

export type CompletionRecord = {
  id: string;
  accountId: string;
  taskId: string;
  taskNameSnapshot: string;
  date: string;
  completed: boolean;
  completedAt?: string;
  updatedAt: string;
};

export type PreferencesRecord = {
  accountId: string;
  selectedDate: string;
  visibleMonth: string;
  firstDayOfWeek: Weekday;
  theme: 'system' | 'light' | 'dark';
};

export type DeviceLeaseRecord = {
  userId: string;
  deviceIdHash: string;
  authorizedUntil: string;
  lastValidatedAt: string;
};

export type RegisteredDevice = {
  id: string;
  device_id_hash: string;
  device_name: string;
  operating_system: string;
  app_version: string;
  registered_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export type DayChecklistItem = {
  task: TaskRecord;
  completion?: CompletionRecord;
  scheduled: boolean;
};

export type DayProgress = {
  total: number;
  completed: number;
  percent: number;
};

export type ExportPayload = {
  exportedAt: string;
  schemaVersion: number;
  accountId: string;
  tasks: TaskRecord[];
  completions: CompletionRecord[];
  preferences?: PreferencesRecord;
};
