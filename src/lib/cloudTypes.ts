import type { CompletionRecord, TaskRecord } from '../types';

export type EntityKind = 'task' | 'completion';
export type CloudEntity = {
  kind: EntityKind;
  id: string;
  payload: Omit<TaskRecord, 'accountId'> | Omit<CompletionRecord, 'accountId'>;
  revision: number;
  deleted: boolean;
  updated_at: string;
  origin: 'desktop' | 'mcp';
};
export type SyncState = {
  accountId: string;
  enabled: boolean;
  timezone: string;
  checkpoint: number;
  lastSyncedAt?: string;
  error?: string;
  configurationPending?: boolean;
  configurationVersion?: number;
};
export type OutboxOperation = {
  sequence?: number;
  operationId: string;
  accountId: string;
  kind: EntityKind;
  entityId: string;
  payload: CloudEntity['payload'];
  deleted: boolean;
  expectedRevision: number;
  status: 'pending' | 'conflict';
  current?: CloudEntity | null;
};
export type CloudVersion = { key: string; accountId: string; kind: EntityKind; entityId: string; revision: number; deleted: boolean };
export const versionKey = (accountId: string, kind: EntityKind, id: string) => `${accountId}:${kind}:${id}`;
type WithoutAccount<T> = T extends unknown ? Omit<T, 'accountId'> : never;
export function withoutAccount<T extends { accountId: string }>(record: T): WithoutAccount<T> {
  const { accountId: _accountId, ...payload } = record;
  return payload as WithoutAccount<T>;
}
