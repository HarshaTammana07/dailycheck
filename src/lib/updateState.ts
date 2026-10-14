export type UpdateState = {
  type: string;
  message?: string;
  releaseMode?: string;
  info?: { version?: string; releaseNotes?: string | { version: string; note: string }[] | null };
  progress?: { percent?: number };
};

export function updatePercent(state: UpdateState) {
  const percent = Number(state.progress?.percent ?? 0);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
}

export function releaseNotesText(state: UpdateState) {
  const notes = state.info?.releaseNotes;
  const text = typeof notes === 'string' ? notes : Array.isArray(notes) ? notes.map(item => `${item.version}\n${item.note}`).join('\n\n') : 'A new DailyCheck version is available.';
  return text.replace(/<[^>]*>/g, '').slice(0, 12000);
}
