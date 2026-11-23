import type { BudgetItem, Payment, Saving } from '../db/types';
import { daysBetween, localToday, monthsRemaining, weeksRemaining } from './dates';

export type BudgetSummary = {
  totalBudget: number;
  totalPaid: number;
  remaining: number;
  savings: number;
  overBudget: number;
  items: Array<BudgetItem & { acuan: number; terbayar: number; sisa_tagihan: number; selisih: number; overpaid: boolean }>;
};

export function calculateBudget(items: BudgetItem[], payments: Payment[], targetBudget = 0): BudgetSummary {
  const activeItems = items.filter((item) => !item.deleted);
  const activePayments = payments.filter((payment) => !payment.deleted);
  const calculated = activeItems.map((item) => {
    const acuan = item.harga_deal > 0 ? item.harga_deal : item.estimasi;
    const terbayar = activePayments
      .filter((payment) => payment.budget_id === item.id && payment.status === 'Lunas')
      .reduce((sum, payment) => sum + Number(payment.nominal || 0), 0);
    return {
      ...item,
      acuan,
      terbayar,
      sisa_tagihan: acuan - terbayar,
      selisih: item.harga_deal > 0 ? item.estimasi - item.harga_deal : 0,
      overpaid: terbayar > acuan
    };
  });
  const totalBudget = calculated.reduce((sum, item) => sum + item.acuan, 0);
  const totalPaid = calculated.reduce((sum, item) => sum + item.terbayar, 0);
  return {
    totalBudget,
    totalPaid,
    remaining: totalBudget - totalPaid,
    savings: calculated.reduce((sum, item) => sum + item.selisih, 0),
    overBudget: targetBudget > 0 ? totalBudget - targetBudget : 0,
    items: calculated
  };
}

export function calculateSavings(savings: Saving[], target: number, deadline: string, fallbackDeadline: string, today = localToday()) {
  const active = savings.filter((entry) => !entry.deleted);
  const collected = active.reduce((sum, entry) => sum + Number(entry.nominal || 0), 0);
  const goal = target > 0 ? target : 0;
  const shortage = Math.max(0, goal - collected);
  const endDate = deadline || fallbackDeadline;
  const remainingDays = endDate ? daysBetween(today, endDate) : 0;
  const months = endDate ? monthsRemaining(today, endDate) : 0;
  const weeks = endDate ? weeksRemaining(today, endDate) : 0;
  const contributions = active.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.penabung] = (acc[entry.penabung] ?? 0) + Number(entry.nominal || 0);
    return acc;
  }, {});
  let message = '';
  if (!goal) message = 'Isi target tabungan atau tambahkan anggaran agar kalkulator dapat digunakan.';
  else if (shortage === 0) message = 'Target tabungan sudah tercapai. Keren!';
  else if (!endDate) message = 'Isi tenggat tabungan atau tanggal pernikahan untuk menghitung kebutuhan rutin.';
  else if (remainingDays <= 0) message = 'Tenggat tabungan sudah lewat. Perbarui tenggat untuk melihat kebutuhan berikutnya.';
  return {
    collected, target: goal, shortage, progress: goal > 0 ? Math.min(100, (collected / goal) * 100) : 0,
    contributions, months, weeks, monthlyNeeded: shortage > 0 && months > 0 ? Math.ceil(shortage / months) : 0,
    weeklyNeeded: shortage > 0 && weeks > 0 ? Math.ceil(shortage / weeks) : 0,
    remainingDays, message, endDate
  };
}

export function getAttentionPayments(payments: Payment[], budget: BudgetItem[], today = localToday()) {
  const budgetMap = new Map(budget.filter((item) => !item.deleted).map((item) => [item.id, item.item]));
  return payments.filter((payment) => {
    if (payment.deleted || payment.status === 'Lunas' || !payment.jatuh_tempo) return false;
    return daysBetween(today, payment.jatuh_tempo) <= 30;
  }).sort((a, b) => a.jatuh_tempo.localeCompare(b.jatuh_tempo)).map((payment) => ({
    ...payment,
    nama_item: budgetMap.get(payment.budget_id) ?? 'Item budget dihapus',
    days: daysBetween(today, payment.jatuh_tempo)
  }));
}
