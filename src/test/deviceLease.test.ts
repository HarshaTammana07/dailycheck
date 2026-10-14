import { describe, expect, it } from 'vitest';
import { isLeaseStillValid } from '../lib/deviceClient';

describe('offline authorization lease', () => {
  it('allows access only before the lease expires', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    expect(isLeaseStillValid('2026-01-01T13:00:00.000Z', now)).toBe(true);
    expect(isLeaseStillValid('2026-01-01T11:59:59.000Z', now)).toBe(false);
  });
});
