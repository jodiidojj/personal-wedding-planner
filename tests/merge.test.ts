import { describe, expect, it } from 'vitest';
import { mergeRecord, shouldClearDirty } from '../src/lib/merge';

describe('last-write-wins merge', () => {
  it('uses the newer remote record', () => {
    const result = mergeRecord({ id: 'a', updated_at: '2026-01-01T00:00:00.000Z', value: 'local', _dirty: false }, { id: 'a', updated_at: '2026-01-02T00:00:00.000Z', value: 'remote' });
    expect(result.value).toBe('remote');
  });
  it('keeps a newer dirty local record', () => {
    const local = { id: 'a', updated_at: '2026-01-03T00:00:00.000Z', value: 'local', _dirty: true };
    const result = mergeRecord(local, { id: 'a', updated_at: '2026-01-02T00:00:00.000Z', value: 'remote' });
    expect(result).toBe(local);
  });
  it('chooses the server record when timestamps match', () => {
    const result = mergeRecord({ id: 'a', updated_at: '2026-01-02T00:00:00.000Z', value: 'local', _dirty: true }, { id: 'a', updated_at: '2026-01-02T00:00:00.000Z', value: 'server' });
    expect(result.value).toBe('server');
  });
  it('clears dirty only when the saved version did not change in flight', () => {
    expect(shouldClearDirty('same', 'same')).toBe(true);
    expect(shouldClearDirty('old', 'new')).toBe(false);
  });
});
