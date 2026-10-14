import { describe, expect, it } from 'vitest';
import { releaseNotesText, updatePercent } from '../lib/updateState';
describe('Update display data', () => {
  it('bounds progress and handles malformed numbers', () => {
    expect(updatePercent({ type: 'download-progress', progress: { percent: 125 } })).toBe(100);
    expect(updatePercent({ type: 'download-progress', progress: { percent: -10 } })).toBe(0);
    expect(updatePercent({ type: 'download-progress', progress: { percent: NaN } })).toBe(0);
  });
  it('shows HTML release notes as bounded plain text', () => {
    expect(releaseNotesText({ type: 'available', info: { releaseNotes: '<p>Fixed updates</p>' } })).toBe('Fixed updates');
    expect(releaseNotesText({ type: 'available', info: { releaseNotes: 'x'.repeat(15000) } })).toHaveLength(12000);
  });
  it('supports multi-version release notes', () => {
    expect(releaseNotesText({ type: 'available', info: { releaseNotes: [{ version: '1.0.1', note: 'Improved updates' }] } })).toContain('1.0.1\nImproved updates');
  });
});
