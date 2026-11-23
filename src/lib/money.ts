export function formatRupiah(value: number | string | null | undefined): string {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0).replace(/\u00a0/g, ' ');
}

export function parseRupiah(value: string): number {
  const parsed = Number(value.replace(/[^0-9-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function groupThousands(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : '';
}
