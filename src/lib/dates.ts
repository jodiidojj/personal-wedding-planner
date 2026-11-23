export function localToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function dateToLocalDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function daysBetween(from: string, to: string): number {
  const a = dateToLocalDay(from).getTime();
  const b = dateToLocalDay(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function formatDate(value: string): string {
  if (!value) return '—';
  const date = dateToLocalDay(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function monthsRemaining(from: string, to: string): number {
  const start = dateToLocalDay(from);
  const end = dateToLocalDay(to);
  if (end.getTime() <= start.getTime()) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (end.getDate() > start.getDate()) months += 1;
  return Math.max(1, months);
}

export function weeksRemaining(from: string, to: string): number {
  const days = daysBetween(from, to);
  return days <= 0 ? 0 : Math.max(1, Math.ceil(days / 7));
}

export function normalizeDateOnly(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return dateOnly[1];
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : normalizeDateOnly(parsed);
}
