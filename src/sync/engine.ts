import { db, ensureLocalConfig } from '../db/db';
import type { LocalConfig, SyncEntity, SyncRecord } from '../db/types';
import { mergeRecord, shouldClearDirty } from '../lib/merge';
import { normalizeDateOnly } from '../lib/dates';

const SHEET_TO_TABLE: Record<SyncEntity, string> = {
  Budget: 'budget', Pembayaran: 'payments', Tabungan: 'savings', Todo: 'todos',
  Vendor: 'vendors', Administrasi: 'administrations', Seragam: 'uniforms',
  Seserahan: 'gifts', Rundown: 'rundown'
};
const ACTIVE_ENTITIES: SyncEntity[] = ['Budget', 'Pembayaran', 'Tabungan', 'Todo', 'Vendor', 'Administrasi', 'Seragam', 'Seserahan', 'Rundown'];
let syncInFlight: Promise<SyncResult> | null = null;

export type SyncResult = { ok: boolean; message: string; applied?: Record<string, number>; skipped?: Record<string, number> };
type SyncResponse = {
  ok: boolean;
  serverTime?: string;
  data?: Partial<Record<SyncEntity | 'Pengaturan', Array<Record<string, unknown>>>>;
  applied?: Record<string, number>;
  skipped?: Record<string, number>;
  error?: string;
};

function toSheetRecord(row: Record<string, unknown>): Record<string, unknown> {
  const record = { ...row };
  delete record._dirty;
  return record;
}

async function fetchPendingChanges() {
  const changes: Record<string, Array<Record<string, unknown>>> = {};
  const snapshots: Array<{ table: string; id: string; updated_at: string }> = [];
  for (const [sheet, tableName] of Object.entries(SHEET_TO_TABLE)) {
    const rows = await db.table(tableName).toArray() as Array<Record<string, unknown>>;
    const pending = rows.filter((row) => row._dirty === true);
    if (pending.length) {
      changes[sheet] = pending.map(toSheetRecord);
      pending.forEach((row) => snapshots.push({
        table: tableName, id: String(row.id), updated_at: String(row.updated_at ?? '')
      }));
    }
  }
  const settings = await db.settings.toArray();
  const dirtySettings = settings.filter((row) => row._dirty === true);
  if (dirtySettings.length) {
    changes.Pengaturan = dirtySettings.map((row) => ({ key: row.key, value: row.value, updated_at: row.updated_at }));
    dirtySettings.forEach((row) => snapshots.push({ table: 'settings', id: row.key, updated_at: row.updated_at }));
  }
  return { changes, snapshots };
}

async function applyRemoteData(data: SyncResponse['data']): Promise<void> {
  if (!data) return;
  for (const entity of ACTIVE_ENTITIES) {
    const remoteRows = data[entity] ?? [];
    const table = db.table(SHEET_TO_TABLE[entity]);
    await db.transaction('rw', table, async () => {
      for (const raw of remoteRows) {
        const remote = raw as unknown as SyncRecord;
        if (!remote.id) continue;
        for (const field of ['tanggal', 'jatuh_tempo', 'tgl_bayar', 'deadline']) {
          if (field in remote) remote[field] = normalizeDateOnly(String(remote[field] ?? ''));
        }
        const local = await table.get(remote.id) as (SyncRecord & { _dirty?: boolean }) | undefined;
        const merged = mergeRecord(local, remote) as SyncRecord & { _dirty?: boolean };
        await table.put({ ...merged, _dirty: merged._dirty ?? false });
      }
    });
  }
  const remoteSettings = data.Pengaturan ?? [];
  await db.transaction('rw', db.settings, async () => {
    for (const raw of remoteSettings) {
      const key = String(raw.key ?? '');
      if (!key) continue;
      const remote = {
        key, value: String(raw.value ?? ''), updated_at: String(raw.updated_at ?? ''), _dirty: false
      };
      const local = await db.settings.get(key);
      const merged = mergeRecord(local, remote);
      await db.settings.put(merged);
    }
  });
}

async function clearSentDirty(snapshots: Array<{ table: string; id: string; updated_at: string }>): Promise<void> {
  for (const item of snapshots) {
    const table = db.table(item.table);
    const current = await table.get(item.id) as Record<string, unknown> | undefined;
    if (current && shouldClearDirty(item.updated_at, String(current.updated_at ?? ''))) {
      await table.update(item.id, { _dirty: false });
    }
  }
}

async function performSync(): Promise<SyncResult> {
  const config: LocalConfig = await ensureLocalConfig();
  if (!config.scriptUrl || !config.token) return { ok: false, message: 'Lengkapi URL Apps Script dan token di Pengaturan.' };
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(config.scriptUrl.trim())) {
    return { ok: false, message: 'URL Apps Script harus berupa URL Web App yang berakhiran /exec.' };
  }

  const { changes, snapshots } = await fetchPendingChanges();
  const since = config.lastSyncServerTime
    ? new Date(Date.parse(config.lastSyncServerTime) - 120_000).toISOString()
    : null;
  const payload = { token: config.token, action: 'sync', since, changes };
  try {
    const response = await fetch(config.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const raw = await response.text();
    let result: SyncResponse;
    try { result = JSON.parse(raw) as SyncResponse; }
    catch { throw new Error('Respons Apps Script tidak terbaca. Periksa URL /exec dan pastikan Web App sudah di-deploy ulang.'); }
    if (!response.ok || !result.ok) {
      if (result.error === 'UNAUTHORIZED') throw new Error('Token salah atau belum cocok dengan Script Properties API_TOKEN.');
      throw new Error(result.error || `Sinkronisasi gagal (HTTP ${response.status}).`);
    }
    await applyRemoteData(result.data);
    await clearSentDirty(snapshots);
    const now = new Date().toISOString();
    await db.local_config.put({
      ...config, lastSyncServerTime: result.serverTime ?? now, lastSyncAt: now,
      lastSyncStatus: 'success', lastSyncMessage: 'Data berhasil disinkronkan.'
    });
    return { ok: true, message: 'Data berhasil disinkronkan.', applied: result.applied, skipped: result.skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat sinkronisasi.';
    await db.local_config.put({ ...config, lastSyncStatus: 'error', lastSyncMessage: message });
    return { ok: false, message };
  }
}

export function syncNow(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = performSync().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

export async function testConnection(): Promise<SyncResult> {
  const config = await ensureLocalConfig();
  if (!config.scriptUrl || !config.token) return { ok: false, message: 'Isi URL Apps Script dan token terlebih dahulu.' };
  try {
    const response = await fetch(config.scriptUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: config.token, action: 'ping' }), redirect: 'follow'
    });
    const result = await response.json() as SyncResponse;
    return result.ok ? { ok: true, message: 'Koneksi dan token valid.' } : {
      ok: false, message: result.error === 'UNAUTHORIZED' ? 'Token tidak cocok.' : (result.error ?? 'Uji koneksi gagal.')
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Tidak dapat terhubung.' };
  }
}

export async function countPendingChanges(): Promise<number> {
  let count = 0;
  for (const tableName of Object.values(SHEET_TO_TABLE)) {
    const rows = await db.table(tableName).toArray() as Array<{ _dirty?: boolean }>;
    count += rows.filter((row) => row._dirty).length;
  }
  const settings = await db.settings.toArray();
  return count + settings.filter((row) => row._dirty).length;
}
