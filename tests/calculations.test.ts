import { describe, expect, it } from 'vitest';
import { calculateBudget, calculateSavings } from '../src/lib/calculations';
import type { BudgetItem, Payment, Saving } from '../src/db/types';

const meta = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', deleted: false };
const budget: BudgetItem[] = [
  { ...meta, id: 'budget01', kategori: 'Venue', item: 'Gedung', estimasi: 10_000_000, harga_deal: 9_000_000, sumber: 'manual', sumber_id: '', catatan: '' },
  { ...meta, id: 'budget02', kategori: 'Katering', item: 'Makan', estimasi: 5_000_000, harga_deal: 0, sumber: 'manual', sumber_id: '', catatan: '' }
];
const payments: Payment[] = [
  { ...meta, id: 'pay00001', budget_id: 'budget01', jenis: 'DP', nominal: 2_000_000, jatuh_tempo: '', tgl_bayar: '', status: 'Lunas', dibayar_oleh: '', catatan: '' },
  { ...meta, id: 'pay00002', budget_id: 'budget01', jenis: 'Cicilan', nominal: 1_000_000, jatuh_tempo: '', tgl_bayar: '', status: 'Belum', dibayar_oleh: '', catatan: '' },
  { ...meta, id: 'pay00003', budget_id: 'budget02', jenis: 'DP', nominal: 5_500_000, jatuh_tempo: '', tgl_bayar: '', status: 'Lunas', dibayar_oleh: '', catatan: '' }
];

describe('calculateBudget', () => {
  it('uses deal price when available and sums only paid payment records', () => {
    const result = calculateBudget(budget, payments, 20_000_000);
    expect(result.totalBudget).toBe(14_000_000);
    expect(result.totalPaid).toBe(7_500_000);
    expect(result.remaining).toBe(6_500_000);
    expect(result.savings).toBe(1_000_000);
    expect(result.items[0].terbayar).toBe(2_000_000);
  });

  it('keeps deleted items out of totals and detects overpayment', () => {
    const removed = { ...budget[1], deleted: true };
    const overpaid = [{ ...payments[2], nominal: 6_000_000 }];
    const result = calculateBudget([budget[0], removed], overpaid);
    expect(result.totalBudget).toBe(9_000_000);
    expect(result.items[0].overpaid).toBe(true);
  });
});

describe('calculateSavings', () => {
  const deposits: Saving[] = [
    { ...meta, id: 'saving01', tanggal: '2026-01-10', penabung: 'A', nominal: 2_000_000, catatan: '' },
    { ...meta, id: 'saving02', tanggal: '2026-01-11', penabung: 'B', nominal: 1_000_000, catatan: '' }
  ];

  it('calculates progress, contributions, and monthly/weekly target', () => {
    const result = calculateSavings(deposits, 12_000_000, '2026-07-01', '', '2026-01-01');
    expect(result.collected).toBe(3_000_000);
    expect(result.shortage).toBe(9_000_000);
    expect(result.contributions.A).toBe(2_000_000);
    expect(result.monthlyNeeded).toBeGreaterThan(0);
    expect(result.weeklyNeeded).toBeGreaterThan(0);
  });

  it('handles completed target and past deadline without dividing by zero', () => {
    const completed = calculateSavings(deposits, 3_000_000, '2025-12-01', '', '2026-01-01');
    expect(completed.shortage).toBe(0);
    expect(completed.message).toContain('tercapai');
    expect(completed.monthlyNeeded).toBe(0);
    const late = calculateSavings(deposits, 10_000_000, '2025-12-01', '', '2026-01-01');
    expect(late.monthlyNeeded).toBe(0);
    expect(late.weeklyNeeded).toBe(0);
    expect(late.message).toContain('sudah lewat');
  });
});
