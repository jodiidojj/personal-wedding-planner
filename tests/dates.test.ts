import { describe, expect, it } from 'vitest';
import { dateToLocalDay, daysBetween, normalizeDateOnly } from '../src/lib/dates';

describe('normalisasi tanggal', () => {
  it('preserves a YYYY-MM-DD value without timezone conversion', () => {
    expect(normalizeDateOnly('2026-11-23')).toBe('2026-11-23');
  });
  it('converts a timestamp to the Asia/Jakarta calendar day', () => {
    expect(normalizeDateOnly('2026-11-22T18:00:00.000Z')).toBe('2026-11-23');
  });
  it('calculates day differences using local calendar dates', () => {
    expect(daysBetween('2026-11-23', '2026-11-24')).toBe(1);
    expect(dateToLocalDay('2026-11-23').getDate()).toBe(23);
  });
});
