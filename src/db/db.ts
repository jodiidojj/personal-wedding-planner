import Dexie, { type EntityTable } from 'dexie';
import type {
  Administration, BudgetItem, Gift, LocalConfig, Payment, Saving, ScheduleItem,
  SettingRecord, Todo, Uniform, Vendor
} from './types';

class WeddingDatabase extends Dexie {
  budget!: EntityTable<BudgetItem, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  savings!: EntityTable<Saving, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  local_config!: EntityTable<LocalConfig, 'id'>;
  todos!: EntityTable<Todo, 'id'>;
  vendors!: EntityTable<Vendor, 'id'>;
  administrations!: EntityTable<Administration, 'id'>;
  uniforms!: EntityTable<Uniform, 'id'>;
  gifts!: EntityTable<Gift, 'id'>;
  rundown!: EntityTable<ScheduleItem, 'id'>;

  constructor() {
    super('WeddingPlannerDB');
    this.version(1).stores({
      budget: 'id, kategori, sumber, updated_at, deleted, _dirty',
      payments: 'id, budget_id, status, jatuh_tempo, updated_at, deleted, _dirty',
      savings: 'id, tanggal, penabung, updated_at, deleted, _dirty',
      settings: 'key, updated_at, _dirty',
      local_config: 'id',
      todos: 'id, deadline, status, modul, updated_at, deleted, _dirty',
      vendors: 'id, kategori, status, updated_at, deleted, _dirty',
      administrations: 'id, status, tanggal, updated_at, deleted, _dirty',
      uniforms: 'id, status, updated_at, deleted, _dirty',
      gifts: 'id, status, updated_at, deleted, _dirty',
      rundown: 'id, tanggal, updated_at, deleted, _dirty'
    });
  }
}

export const db = new WeddingDatabase();

export const DEFAULT_LOCAL_CONFIG: LocalConfig = {
  id: 'main', scriptUrl: '', token: '', lastSyncServerTime: '', lastSyncAt: '',
  lastSyncStatus: 'never', lastSyncMessage: ''
};

export async function ensureLocalConfig(): Promise<LocalConfig> {
  const current = await db.local_config.get('main');
  if (current) return current;
  await db.local_config.put(DEFAULT_LOCAL_CONFIG);
  return DEFAULT_LOCAL_CONFIG;
}
