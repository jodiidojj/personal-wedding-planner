export type Meta = {
  created_at: string;
  updated_at: string;
  deleted: boolean;
  _dirty?: boolean;
};

export type BudgetItem = Meta & {
  id: string;
  kategori: string;
  item: string;
  estimasi: number;
  harga_deal: number;
  sumber: 'manual' | 'vendor' | 'seragam' | 'seserahan';
  sumber_id: string;
  catatan: string;
};

export type Payment = Meta & {
  id: string;
  budget_id: string;
  jenis: 'DP' | 'Cicilan' | 'Pelunasan';
  nominal: number;
  jatuh_tempo: string;
  tgl_bayar: string;
  status: 'Belum' | 'Lunas';
  dibayar_oleh: string;
  catatan: string;
};

export type Saving = Meta & {
  id: string;
  tanggal: string;
  penabung: string;
  nominal: number;
  catatan: string;
};

export type SettingKey = 'nama_1' | 'nama_2' | 'tanggal_nikah' | 'target_budget' | 'target_tabungan' | 'tenggat_tabungan';
export type SettingRecord = { key: string; value: string; updated_at: string; _dirty?: boolean };
export type LocalConfig = {
  id: 'main';
  scriptUrl: string;
  token: string;
  lastSyncServerTime: string;
  lastSyncAt: string;
  lastSyncStatus: 'never' | 'success' | 'error';
  lastSyncMessage: string;
};

export type Todo = Meta & { id: string; tugas: string; deadline: string; pic: string; status: string; prioritas: string; modul: string; ref_id: string; catatan: string };
export type Vendor = Meta & { id: string; kategori: string; nama: string; kontak: string; harga: number; paket: string; kelebihan: string; kekurangan: string; skor: number; status: string; link: string; catatan: string };
export type Administration = Meta & { id: string; dokumen: string; untuk: string; status: string; tanggal: string; catatan: string };
export type Uniform = Meta & { id: string; penerima: string; peran: string; ukuran: string; model: string; bahan: string; penjahit: string; biaya: number; status: string; catatan: string };
export type Gift = Meta & { id: string; barang: string; jumlah: number; harga: number; toko: string; status: string; catatan: string };
export type ScheduleItem = Meta & { id: string; tanggal: string; waktu_mulai: string; durasi_menit: number; acara: string; pic: string; lokasi: string; catatan: string };

export type SyncEntity = 'Budget' | 'Pembayaran' | 'Tabungan' | 'Todo' | 'Vendor' | 'Administrasi' | 'Seragam' | 'Seserahan' | 'Rundown';
export type SyncRecord = Record<string, string | number | boolean | null | undefined> & {
  id: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
};
