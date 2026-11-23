import type { Table } from 'dexie';
import { db } from './db';
import { createId } from '../lib/id';
import { localToday } from '../lib/dates';
import type { BudgetItem, Meta, Payment, Saving, SettingRecord } from './types';

export type RecordTable = 'budget' | 'payments' | 'savings';

function metadata<T extends { id: string } & Partial<Meta>>(input: T, existing?: T): T & Meta {
  const now = new Date().toISOString();
  return {
    ...input,
    id: input.id || createId(),
    created_at: existing?.created_at ?? input.created_at ?? now,
    updated_at: now,
    deleted: false,
    _dirty: true
  } as T & Meta;
}

export async function saveRecord<T extends { id: string } & Partial<Meta>>(
  table: Table<T, string>, input: T
): Promise<string> {
  const existing = input.id ? await table.get(input.id) : undefined;
  const record = metadata(input, existing);
  await table.put(record);
  return record.id;
}

export async function softDeleteRecord<T extends { id: string } & Meta>(table: Table<T, string>, id: string): Promise<void> {
  const existing = await table.get(id);
  if (!existing) return;
  await table.put({ ...existing, deleted: true, updated_at: new Date().toISOString(), _dirty: true });
}

export const budgetRepository = {
  save: (record: BudgetItem) => saveRecord(db.budget, record),
  remove: (id: string) => softDeleteRecord(db.budget, id)
};
export const paymentRepository = {
  save: (record: Payment) => saveRecord(db.payments, record),
  remove: (id: string) => softDeleteRecord(db.payments, id)
};
export const savingRepository = {
  save: (record: Saving) => saveRecord(db.savings, record),
  remove: (id: string) => softDeleteRecord(db.savings, id)
};

export async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.settings.get(key);
  const record: SettingRecord = {
    key, value, updated_at: new Date().toISOString(), _dirty: true
  };
  if (existing) record.updated_at = new Date().toISOString();
  await db.settings.put(record);
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.settings.toArray();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function createBlankBudget(): BudgetItem {
  const now = new Date().toISOString();
  return {
    id: createId(), kategori: 'Lain-lain', item: '', estimasi: 0, harga_deal: 0,
    sumber: 'manual', sumber_id: '', catatan: '', created_at: now, updated_at: now,
    deleted: false, _dirty: true
  };
}

export function createBlankPayment(budgetId: string): Payment {
  const now = new Date().toISOString();
  return {
    id: createId(), budget_id: budgetId, jenis: 'DP', nominal: 0,
    jatuh_tempo: '', tgl_bayar: '', status: 'Belum', dibayar_oleh: '', catatan: '',
    created_at: now, updated_at: now, deleted: false, _dirty: true
  };
}

export function createBlankSaving(penabung = ''): Saving {
  const now = new Date().toISOString();
  return {
    id: createId(), tanggal: localToday(), penabung, nominal: 0, catatan: '',
    created_at: now, updated_at: now, deleted: false, _dirty: true
  };
}
