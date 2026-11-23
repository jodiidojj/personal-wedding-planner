import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  AlertCircle, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Cloud, CloudOff, Heart, Home, Plus,
  RefreshCw, Settings, Wallet, X, PiggyBank, Trash2, Pencil, Search, Sparkles
} from 'lucide-react';
import { db, ensureLocalConfig } from './db/db';
import type { BudgetItem, Payment, Saving, LocalConfig } from './db/types';
import { budgetRepository, paymentRepository, savingRepository, setSetting, createBlankBudget, createBlankPayment, createBlankSaving } from './db/repository';
import { calculateBudget, calculateSavings, getAttentionPayments } from './lib/calculations';
import { formatRupiah } from './lib/money';
import { daysBetween, formatDate, localToday } from './lib/dates';
import { Modal } from './components/Modal';
import { MoneyInput } from './components/MoneyInput';
import { countPendingChanges, syncNow, testConnection } from './sync/engine';

type Tab = 'home' | 'budget' | 'savings' | 'settings';
type Toast = { message: string; tone?: 'success' | 'error' } | null;

const CATEGORIES = ['Venue', 'Katering', 'Dekorasi', 'Dokumentasi', 'MUA', 'Busana', 'Undangan', 'Seserahan', 'Hiburan/MC', 'Transport', 'Akomodasi', 'Lain-lain'];
const emptySettings = { nama_1: '', nama_2: '', tanggal_nikah: '', target_budget: '', target_tabungan: '', tenggat_tabungan: '' };

function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState<Toast>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [quickBudgetOpen, setQuickBudgetOpen] = useState(false);
  const [quickSavingOpen, setQuickSavingOpen] = useState(false);
  const budgets = useLiveQuery(() => db.budget.toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? [];
  const savings = useLiveQuery(() => db.savings.toArray(), []) ?? [];
  const settingRows = useLiveQuery(() => db.settings.toArray(), []) ?? [];
  const config = useLiveQuery(() => ensureLocalConfig(), []) ?? null;
  const settingValues = useMemo(() => Object.fromEntries(settingRows.map((row) => [row.key, row.value])), [settingRows]);
  const targetBudget = Number(settingValues.target_budget || 0);
  const targetSavings = Number(settingValues.target_tabungan || 0);
  const budgetSummary = useMemo(() => calculateBudget(budgets, payments, targetBudget), [budgets, payments, targetBudget]);
  const savingsSummary = useMemo(() => calculateSavings(savings, targetSavings || budgetSummary.totalBudget, settingValues.tenggat_tabungan || '', settingValues.tanggal_nikah || ''), [savings, targetSavings, budgetSummary.totalBudget, settingValues.tenggat_tabungan, settingValues.tanggal_nikah]);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const refreshPending = useCallback(async () => setPending(await countPendingChanges()), []);
  const runSync = useCallback(async () => {
    setSyncing(true);
    const result = await syncNow();
    setSyncing(false);
    await refreshPending();
    notify(result.message, result.ok ? 'success' : 'error');
  }, [notify, refreshPending]);

  useEffect(() => {
    void navigator.storage?.persist?.();
    void refreshPending();
    const kick = () => { void ensureLocalConfig().then((current) => { if (current.scriptUrl && current.token) void runSync(); }); };
    const onVisible = () => { if (document.visibilityState === 'visible') kick(); };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);
    kick();
    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshPending, runSync]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshPending(); }, 350);
    return () => window.clearTimeout(timer);
  }, [budgets, payments, savings, settingRows, refreshPending]);

  useEffect(() => {
    if (!config?.scriptUrl || !config.token) return;
    const timer = window.setTimeout(() => { void runSync(); }, 2200);
    return () => window.clearTimeout(timer);
  }, [budgets, payments, savings, settingRows, config?.scriptUrl, config?.token, runSync]);

  const addBudgetQuick = async (item: BudgetItem) => {
    await budgetRepository.save(item);
    setQuickBudgetOpen(false);
    notify('Pengeluaran tersimpan.');
    setTab('budget');
  };
  const addSavingQuick = async (item: Saving) => {
    await savingRepository.save(item);
    setQuickSavingOpen(false);
    notify('Setoran tersimpan.');
    setTab('savings');
  };

  const standalone = typeof navigator !== 'undefined' && ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches);
  return <div className="app-shell">
    <header className="top-header">
      <div className="brand-mark"><Heart size={19} fill="currentColor" /></div>
      <div className="brand-copy"><span>RUANG BERDUA</span><strong>Wedding Planner</strong></div>
      <button className={`sync-indicator ${syncing ? 'is-syncing' : ''}`} onClick={runSync} aria-label="Sinkronkan sekarang">
        {navigator.onLine ? <Cloud size={17} /> : <CloudOff size={17} />}
        <span>{syncing ? 'Sinkron…' : pending > 0 ? `${pending} menunggu` : config?.lastSyncAt ? 'Tersinkron' : 'Belum sinkron'}</span>
      </button>
    </header>

    {!standalone && <InstallHint />}

    <PwaUpdateNotice />
    <main className="main-content">
      {tab === 'home' && <Dashboard
        settings={settingValues} summary={budgetSummary} savings={savingsSummary}
        attention={getAttentionPayments(payments, budgets)} onGo={setTab}
        onAddBudget={() => setQuickBudgetOpen(true)} onAddSaving={() => setQuickSavingOpen(true)}
        config={config} pending={pending} syncing={syncing} onSync={runSync}
      />}
      {tab === 'budget' && <BudgetPage payments={payments} summary={budgetSummary} targetBudget={targetBudget} onNotify={notify} />}
      {tab === 'savings' && <SavingsPage savings={savings} summary={savingsSummary} settings={settingValues} onNotify={notify} />}
      {tab === 'settings' && <SettingsPage settings={settingValues} config={config} onNotify={notify} onSync={runSync} />}
    </main>

    <nav className="tab-bar" aria-label="Navigasi utama">
      <TabButton active={tab === 'home'} onClick={() => setTab('home')} icon={<Home size={20} />} label="Beranda" />
      <TabButton active={tab === 'budget'} onClick={() => setTab('budget')} icon={<Wallet size={20} />} label="Budget" />
      <TabButton active={tab === 'savings'} onClick={() => setTab('savings')} icon={<PiggyBank size={20} />} label="Tabungan" />
      <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings size={20} />} label="Pengaturan" />
    </nav>

    {quickBudgetOpen && <BudgetForm initial={createBlankBudget()} onClose={() => setQuickBudgetOpen(false)} onSave={addBudgetQuick} />}
    {quickSavingOpen && <SavingForm initial={createBlankSaving(settingValues.nama_1 || '')} names={[settingValues.nama_1, settingValues.nama_2].filter(Boolean)} canDelete={false} onClose={() => setQuickSavingOpen(false)} onSave={addSavingQuick} />}
    {toast && <div className={`toast ${toast.tone ?? 'success'}`} role="status">{toast.tone === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}{toast.message}</div>}
  </div>;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button className={`tab-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function InstallHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('install-hint-dismissed') === '1');
  if (dismissed) return null;
  return <div className="install-hint"><Sparkles size={17} /><div><strong>Pasang di iPhone</strong><span>Buka lewat Safari → Bagikan → Tambah ke Layar Utama agar bisa digunakan offline.</span></div>
    <button className="plain-icon" aria-label="Tutup panduan" onClick={() => { localStorage.setItem('install-hint-dismissed', '1'); setDismissed(true); }}><X size={17} /></button></div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function Dashboard({ settings, summary, savings, attention, onGo, onAddBudget, onAddSaving, config, pending, syncing, onSync }: {
  settings: Record<string, string>; summary: ReturnType<typeof calculateBudget>; savings: ReturnType<typeof calculateSavings>;
  attention: ReturnType<typeof getAttentionPayments>; onGo: (tab: Tab) => void; onAddBudget: () => void;
  onAddSaving: () => void; config: LocalConfig | null; pending: number; syncing: boolean; onSync: () => void;
}) {
  const today = localToday();
  const days = settings.tanggal_nikah ? daysBetween(today, settings.tanggal_nikah) : null;
  const couple = [settings.nama_1, settings.nama_2].filter(Boolean).join(' & ');
  const countdown = days === null ? 'Atur tanggal hari bahagia' : days > 0 ? `H-${days} hari` : days === 0 ? 'Hari ini hari bahagia!' : `Lewat ${Math.abs(days)} hari`;
  const statusLabel = syncing ? 'Sedang menyinkronkan' : !navigator.onLine ? `Offline · ${pending} perubahan menunggu` : config?.lastSyncStatus === 'error' ? 'Gagal sinkron · ketuk untuk coba lagi' : config?.lastSyncAt ? `Tersinkron ${formatRelative(config.lastSyncAt)}` : 'Belum pernah sinkron';
  return <>
    <section className="hero-card">
      <div className="hero-glow" /><div className="eyebrow light">PERJALANAN MENUJU HARI H</div>
      <h1>{couple || 'Cerita kalian dimulai di sini'}</h1>
      <div className="countdown-row"><CalendarDays size={18} /><strong>{countdown}</strong></div>
      {settings.tanggal_nikah && <p>{formatDate(settings.tanggal_nikah)}</p>}
      <button className="hero-sync" onClick={onSync}><span className="status-dot" />{statusLabel}<RefreshCw size={14} /></button>
    </section>

    <div className="section-title-row"><div><div className="eyebrow">GAMBARAN BESAR</div><h2>Rencana keuangan</h2></div><button className="text-link" onClick={() => onGo('budget')}>Detail <ChevronRight size={15} /></button></div>
    <div className="money-summary-grid">
      <button className="summary-card feature" onClick={() => onGo('budget')}><span>Total budget</span><strong>{formatRupiah(summary.totalBudget)}</strong><small>{summary.items.length} item pengeluaran</small><Wallet size={20} /></button>
      <button className="summary-card" onClick={() => onGo('budget')}><span>Sudah dibayar</span><strong>{formatRupiah(summary.totalPaid)}</strong><small className="positive"><Check size={13} /> {summary.totalBudget ? Math.round(summary.totalPaid / summary.totalBudget * 100) : 0}% dari budget</small></button>
      <button className="summary-card" onClick={() => onGo('budget')}><span>Sisa tagihan</span><strong>{formatRupiah(summary.remaining)}</strong><small>Belum termasuk yang belum dicatat</small></button>
      <button className="summary-card" onClick={() => onGo('budget')}><span>Hemat dari deal</span><strong className={summary.savings >= 0 ? 'positive-text' : 'negative-text'}>{formatRupiah(summary.savings)}</strong><small>{summary.savings >= 0 ? 'Dari estimasi awal' : 'Di atas estimasi'}</small></button>
    </div>

    <button className="savings-overview" onClick={() => onGo('savings')}>
      <div className="savings-top"><div><span className="eyebrow">TABUNGAN BERDUA</span><h2>{formatRupiah(savings.collected)} <small>/ {formatRupiah(savings.target)}</small></h2></div><div className="progress-ring-label">{Math.round(savings.progress)}%</div></div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${savings.progress}%` }} /></div>
      <div className="savings-foot"><span>Terkumpul</span><strong>{savings.shortage > 0 ? `Kurang ${formatRupiah(savings.shortage)}` : 'Target tercapai ✨'}</strong></div>
      <div className="contribution-mini"><span>{settings.nama_1 || 'Nama 1'} · {formatRupiah(savings.contributions[settings.nama_1] ?? 0)}</span><span>{settings.nama_2 || 'Nama 2'} · {formatRupiah(savings.contributions[settings.nama_2] ?? 0)}</span></div>
    </button>

    <div className="section-title-row attention-heading"><div><div className="eyebrow">JANGAN TERLEWAT</div><h2>Perlu perhatian</h2></div><span className="count-pill">{attention.length}</span></div>
    {attention.length ? <div className="attention-list">{attention.slice(0, 5).map((entry) => <div className={`attention-item ${entry.days < 0 ? 'late' : ''}`} key={entry.id}>
      <div className="attention-icon"><CalendarDays size={17} /></div><div className="attention-copy"><strong>{entry.nama_item}</strong><span>{entry.days < 0 ? `Terlambat ${Math.abs(entry.days)} hari` : entry.days === 0 ? 'Jatuh tempo hari ini' : `${entry.days} hari lagi`} · {formatDate(entry.jatuh_tempo)}</span></div><strong className="attention-amount">{formatRupiah(entry.nominal)}</strong>
    </div>)}</div> : <div className="empty-card small-empty"><CheckCircle2 size={20} /><span>Belum ada pembayaran yang perlu diperhatikan.</span></div>}

    <div className="quick-actions"><button onClick={onAddBudget}><span><Plus size={19} /></span><strong>Pengeluaran</strong><small>Tambah budget</small></button><button onClick={onAddSaving}><span><PiggyBank size={19} /></span><strong>Setoran</strong><small>Tambah tabungan</small></button></div>
    {summary.items.length === 0 && savings.collected === 0 && <div className="gentle-empty"><Heart size={18} /><p>Mulai dari Pengaturan untuk mengisi nama dan tanggal pernikahan. Setelah itu, catat budget serta tabungan kalian.</p><button onClick={() => onGo('settings')}>Buka pengaturan <ChevronRight size={14} /></button></div>}
  </>;
}

function formatRelative(value: string) {
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (!Number.isFinite(elapsed) || elapsed < 1) return 'baru saja';
  if (elapsed < 60) return `${elapsed} menit lalu`;
  const hours = Math.floor(elapsed / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

function BudgetPage({ payments, summary, targetBudget, onNotify }: { payments: Payment[]; summary: ReturnType<typeof calculateBudget>; targetBudget: number; onNotify: (m: string, t?: 'success' | 'error') => void }) {
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Semua kategori');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [paymentFormFor, setPaymentFormFor] = useState<string | null>(null);
  const rows = summary.items.filter((item) => item.item.toLowerCase().includes(search.toLowerCase()) && (categoryFilter === 'Semua kategori' || item.kategori === categoryFilter) && (!unpaidOnly || item.sisa_tagihan > 0));
  const groups = rows.reduce<Record<string, typeof rows>>((acc, item) => { (acc[item.kategori] ??= []).push(item); return acc; }, {});
  const detailItem = summary.items.find((item) => item.id === detail);
  const detailPayments = payments.filter((payment) => payment.budget_id === detail && !payment.deleted);
  const saveBudget = async (item: BudgetItem) => { await budgetRepository.save(item); setEditing(null); onNotify('Item budget tersimpan.'); };
  const removeBudget = async (item: BudgetItem) => {
    if (!window.confirm(`Hapus item “${item.item}”? Data akan disembunyikan, bukan dihapus permanen.`)) return;
    await budgetRepository.remove(item.id);
    setDetail(null); onNotify('Item budget dihapus.');
  };
  return <>
    <PageHeading eyebrow="RENCANA BIAYA" title="Budget" subtitle="Atur biaya, pantau pembayaran, dan lihat sisa tagihan." action={<button className="primary-icon-button" onClick={() => setEditing(createBlankBudget())}><Plus size={20} /></button>} />
    <div className="budget-total-card"><span>Total nilai acuan</span><strong>{formatRupiah(summary.totalBudget)}</strong><div><span>Terbayar <b>{formatRupiah(summary.totalPaid)}</b></span><span>Sisa tagihan <b>{formatRupiah(summary.remaining)}</b></span></div>{targetBudget > 0 && <p className={summary.overBudget > 0 ? 'negative-text' : 'positive-text'}>{summary.overBudget > 0 ? `Melebihi target ${formatRupiah(summary.overBudget)}` : `Sisa target ${formatRupiah(Math.abs(summary.overBudget))}`}</p>}</div>
    {summary.overBudget > 0 && <div className="inline-alert warning"><AlertCircle size={16} /> Total budget melebihi target sebesar {formatRupiah(summary.overBudget)}.</div>}
    <div className="search-row"><div className="search-field"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari item pengeluaran" /></div><button className={`filter-button ${unpaidOnly ? 'selected' : ''}`} onClick={() => setUnpaidOnly(!unpaidOnly)}>Belum lunas</button></div>
    <select className="select-control category-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option>Semua kategori</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
    {Object.keys(groups).length ? Object.entries(groups).map(([category, items]) => {
      const isCollapsed = collapsed.includes(category);
      return <section className="budget-group" key={category}><button className="group-heading" onClick={() => setCollapsed((current) => isCollapsed ? current.filter((x) => x !== category) : [...current, category])}><div><span className="group-dot" /><strong>{category}</strong><small>{items.length} item</small></div><div><b>{formatRupiah(items.reduce((sum, item) => sum + item.acuan, 0))}</b>{isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}</div></button>
        {!isCollapsed && <div className="budget-list">{items.map((item) => <button className="budget-row" key={item.id} onClick={() => setDetail(item.id)}><div className="budget-row-main"><strong>{item.item || 'Item tanpa nama'}</strong><span>{item.terbayar > 0 ? `${formatRupiah(item.terbayar)} terbayar` : 'Belum ada pembayaran'}{item.overpaid ? ' · Pembayaran berlebih' : ''}</span></div><div className="budget-row-value"><b>{formatRupiah(item.acuan)}</b><span className={item.sisa_tagihan <= 0 ? 'positive-text' : ''}>{item.sisa_tagihan <= 0 ? 'Lunas' : `Sisa ${formatRupiah(item.sisa_tagihan)}`}</span></div><ChevronRight size={16} /></button>)}</div>}
      </section>;
    }) : <div className="empty-card"><Wallet size={25} /><strong>Belum ada pengeluaran</strong><span>Tambahkan item seperti venue, katering, atau dokumentasi.</span><button className="primary-button" onClick={() => setEditing(createBlankBudget())}>Tambah item pertama</button></div>}

    {editing && <BudgetForm initial={editing} onClose={() => setEditing(null)} onSave={saveBudget} />}
    {detailItem && <Modal title="Detail pengeluaran" onClose={() => setDetail(null)}>
      <div className="detail-summary"><span>{detailItem.kategori}</span><h3>{detailItem.item}</h3><strong>{formatRupiah(detailItem.acuan)}</strong><div className="detail-meta"><span>Terbayar {formatRupiah(detailItem.terbayar)}</span><span>Sisa {formatRupiah(detailItem.sisa_tagihan)}</span></div>{detailItem.overpaid && <div className="inline-alert warning"><AlertCircle size={15} /> Total pembayaran melebihi nilai acuan.</div>}{detailItem.selisih !== 0 && <p className={detailItem.selisih > 0 ? 'positive-text' : 'negative-text'}>{detailItem.selisih > 0 ? 'Hemat' : 'Lebih mahal'} {formatRupiah(Math.abs(detailItem.selisih))} dari estimasi.</p>}</div>
      <div className="modal-section-title"><h3>Riwayat pembayaran</h3><button className="text-link" onClick={() => setPaymentFormFor(detailItem.id)}><Plus size={15} /> Tambah</button></div>
      {detailPayments.length ? detailPayments.map((payment) => <PaymentRow key={payment.id} payment={payment} onNotify={onNotify} />) : <p className="muted-note">Belum ada pembayaran untuk item ini.</p>}
      {detailItem.sumber === 'manual' ? <div className="modal-actions"><button className="secondary-button" onClick={() => { const baseItem: BudgetItem = { id: detailItem.id, kategori: detailItem.kategori, item: detailItem.item, estimasi: detailItem.estimasi, harga_deal: detailItem.harga_deal, sumber: detailItem.sumber, sumber_id: detailItem.sumber_id, catatan: detailItem.catatan, created_at: detailItem.created_at, updated_at: detailItem.updated_at, deleted: detailItem.deleted, _dirty: detailItem._dirty }; setEditing(baseItem); setDetail(null); }}><Pencil size={16} /> Edit item</button><button className="danger-button" onClick={() => void removeBudget(detailItem)}><Trash2 size={16} /> Hapus</button></div> : <div className="inline-alert"><CircleHelp size={15} /> Item ini dikelola oleh modul lain dan hanya dapat dilihat di Budget.</div>}
      {paymentFormFor === detailItem.id && <PaymentForm budgetId={detailItem.id} onClose={() => setPaymentFormFor(null)} onSave={async (payment) => { await paymentRepository.save(payment); setPaymentFormFor(null); onNotify('Pembayaran tersimpan.'); }} names={[]} />}
    </Modal>}
  </>;
}

function BudgetForm({ initial, onClose, onSave }: { initial: BudgetItem; onClose: () => void; onSave: (item: BudgetItem) => Promise<void> }) {
  const [item, setItem] = useState(initial);
  const update = <K extends keyof BudgetItem>(key: K, value: BudgetItem[K]) => setItem((current) => ({ ...current, [key]: value }));
  return <Modal title={initial.item ? 'Edit item budget' : 'Tambah pengeluaran'} onClose={onClose}><form className="form-stack" onSubmit={(e) => { e.preventDefault(); if (!item.item.trim()) return; void onSave({ ...item, sumber: 'manual' }); }}>
    <label className="field"><span>Nama pengeluaran</span><input required value={item.item} onChange={(e) => update('item', e.target.value)} placeholder="Contoh: Gedung pernikahan" /></label>
    <label className="field"><span>Kategori</span><select className="select-control" value={item.kategori} onChange={(e) => update('kategori', e.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
    <MoneyInput label="Estimasi awal" value={item.estimasi} onChange={(value) => update('estimasi', value)} />
    <MoneyInput label="Harga deal (opsional)" value={item.harga_deal} onChange={(value) => update('harga_deal', value)} />
    <label className="field"><span>Catatan</span><textarea value={item.catatan} onChange={(e) => update('catatan', e.target.value)} placeholder="Catatan tambahan" rows={3} /></label>
    <button className="primary-button" type="submit">Simpan pengeluaran</button>
  </form></Modal>;
}

function PaymentRow({ payment, onNotify }: { payment: Payment; onNotify: (m: string, t?: 'success' | 'error') => void }) {
  const [editing, setEditing] = useState(false);
  const late = payment.status !== 'Lunas' && payment.jatuh_tempo && daysBetween(localToday(), payment.jatuh_tempo) < 0;
  const markPaid = async () => { await paymentRepository.save({ ...payment, status: 'Lunas', tgl_bayar: localToday() }); onNotify('Pembayaran ditandai lunas.'); };
  const remove = async () => { if (!window.confirm('Hapus catatan pembayaran ini?')) return; await paymentRepository.remove(payment.id); onNotify('Pembayaran dihapus.'); };
  return <div className="payment-row"><div><strong>{payment.jenis} · {formatRupiah(payment.nominal)}</strong><span>{payment.status === 'Lunas' ? `Lunas ${payment.tgl_bayar ? `· ${formatDate(payment.tgl_bayar)}` : ''}` : late ? `Terlambat · ${formatDate(payment.jatuh_tempo)}` : payment.jatuh_tempo ? `Jatuh tempo ${formatDate(payment.jatuh_tempo)}` : 'Belum lunas'}</span></div><div className="payment-tools">{payment.status !== 'Lunas' && <button className="tiny-icon success-icon" onClick={() => void markPaid()} title="Tandai lunas"><Check size={16} /></button>}<button className="tiny-icon" onClick={() => setEditing(true)} title="Edit"><Pencil size={15} /></button><button className="tiny-icon" onClick={() => void remove()} title="Hapus"><Trash2 size={15} /></button></div>{editing && <PaymentForm initial={payment} budgetId={payment.budget_id} onClose={() => setEditing(false)} onSave={async (p) => { await paymentRepository.save(p); setEditing(false); onNotify('Pembayaran diperbarui.'); }} names={[]} />}</div>;
}

function PaymentForm({ initial, budgetId, onClose, onSave, names }: { initial?: Payment; budgetId: string; onClose: () => void; onSave: (p: Payment) => Promise<void>; names: string[] }) {
  const [payment, setPayment] = useState(initial ?? createBlankPayment(budgetId));
  const settingRows = useLiveQuery(() => db.settings.toArray(), []) ?? [];
  const availableNames = [...new Set([...names, ...settingRows.filter((row) => row.key === 'nama_1' || row.key === 'nama_2').map((row) => row.value)].filter(Boolean))];
  const update = <K extends keyof Payment>(key: K, value: Payment[K]) => setPayment((current) => ({ ...current, [key]: value }));
  return <Modal title={initial ? 'Edit pembayaran' : 'Tambah pembayaran'} onClose={onClose}><form className="form-stack" onSubmit={(e) => { e.preventDefault(); void onSave(payment); }}>
    <label className="field"><span>Jenis pembayaran</span><select className="select-control" value={payment.jenis} onChange={(e) => update('jenis', e.target.value as Payment['jenis'])}><option>DP</option><option>Cicilan</option><option>Pelunasan</option></select></label>
    <MoneyInput label="Nominal" value={payment.nominal} onChange={(value) => update('nominal', value)} />
    <label className="field"><span>Jatuh tempo</span><input type="date" value={payment.jatuh_tempo} onChange={(e) => update('jatuh_tempo', e.target.value)} /></label>
    <label className="field"><span>Status</span><select className="select-control" value={payment.status} onChange={(e) => update('status', e.target.value as Payment['status'])}><option>Belum</option><option>Lunas</option></select></label>
    {payment.status === 'Lunas' && <label className="field"><span>Tanggal bayar</span><input type="date" value={payment.tgl_bayar || localToday()} onChange={(e) => update('tgl_bayar', e.target.value)} /></label>}
    <label className="field"><span>Dibayar oleh</span><input list="payer-options" value={payment.dibayar_oleh} onChange={(e) => update('dibayar_oleh', e.target.value)} placeholder="Nama penabung / orang tua" /><datalist id="payer-options">{availableNames.map((name) => <option key={name} value={name} />)}<option value="Orang tua" /><option value="Lainnya" /></datalist></label>
    <label className="field"><span>Catatan</span><textarea rows={2} value={payment.catatan} onChange={(e) => update('catatan', e.target.value)} /></label>
    <button className="primary-button" type="submit">Simpan pembayaran</button>
  </form></Modal>;
}

function SavingsPage({ savings, summary, settings, onNotify }: { savings: Saving[]; summary: ReturnType<typeof calculateSavings>; settings: Record<string, string>; onNotify: (m: string, t?: 'success' | 'error') => void }) {
  const [editing, setEditing] = useState<Saving | null>(null);
  const names = [settings.nama_1, settings.nama_2].filter(Boolean);
  const active = savings.filter((row) => !row.deleted).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  const save = async (saving: Saving) => { await savingRepository.save(saving); setEditing(null); onNotify('Setoran tersimpan.'); };
  return <>
    <PageHeading eyebrow="SIMPAN SEDIKIT DEMI SEDIKIT" title="Tabungan" subtitle="Catat kontribusi kalian dan pantau target bersama." action={<button className="primary-icon-button" onClick={() => setEditing(createBlankSaving(names[0] ?? ''))}><Plus size={20} /></button>} />
    <section className="savings-large-card"><div className="eyebrow light">TOTAL TERKUMPUL</div><h2>{formatRupiah(summary.collected)}</h2><p>dari target {formatRupiah(summary.target)}</p><div className="progress-track light-track"><div className="progress-fill" style={{ width: `${summary.progress}%` }} /></div><div className="progress-line"><strong>{Math.round(summary.progress)}%</strong><span>{summary.shortage > 0 ? `Kurang ${formatRupiah(summary.shortage)}` : 'Target tercapai'}</span></div></section>
    <div className="contribution-cards">{names.length ? names.map((name) => <div className="contribution-card" key={name}><span>{name}</span><strong>{formatRupiah(summary.contributions[name] ?? 0)}</strong></div>) : <div className="inline-alert"><CircleHelp size={16} /> Isi nama kalian di Pengaturan agar kontribusi terpisah.</div>}</div>
    <section className="calculator-card"><div className="section-title-row"><div><div className="eyebrow">KALKULATOR RUTIN</div><h2>Berapa perlu menabung?</h2></div><Sparkles size={20} /></div>
      {summary.message ? <p className="calculator-message">{summary.message}</p> : <><p className="muted-note">Sampai {formatDate(summary.endDate)} · {summary.remainingDays} hari tersisa</p><div className="calculator-values"><div><span>Per bulan</span><strong>{formatRupiah(summary.monthlyNeeded)}</strong></div><div><span>Per minggu</span><strong>{formatRupiah(summary.weeklyNeeded)}</strong></div></div></>}
    </section>
    <div className="section-title-row"><div><div className="eyebrow">RIWAYAT</div><h2>Setoran tabungan</h2></div><span className="count-pill">{active.length}</span></div>
    {active.length ? <div className="history-list">{active.map((saving) => <div className="history-row" key={saving.id}><div className="history-date"><strong>{new Intl.DateTimeFormat('id-ID', { day: '2-digit' }).format(new Date(`${saving.tanggal}T12:00:00`))}</strong><span>{new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(`${saving.tanggal}T12:00:00`))}</span></div><div className="history-main"><strong>{saving.penabung || 'Penabung belum dipilih'}</strong><span>{formatDate(saving.tanggal)}{saving.catatan ? ` · ${saving.catatan}` : ''}</span></div><strong className="history-amount">{formatRupiah(saving.nominal)}</strong><button className="tiny-icon" onClick={() => setEditing(saving)} aria-label="Edit setoran"><Pencil size={15} /></button></div>)}</div> : <div className="empty-card"><PiggyBank size={25} /><strong>Belum ada setoran</strong><span>Setoran sekecil apa pun membawa kalian lebih dekat ke hari bahagia.</span><button className="primary-button" onClick={() => setEditing(createBlankSaving(names[0] ?? ''))}>Tambah setoran</button></div>}
    {editing && <SavingForm initial={editing} names={names} canDelete={active.some((row) => row.id === editing.id)} onClose={() => setEditing(null)} onSave={save} />}
  </>;
}

function SavingForm({ initial, names, canDelete, onClose, onSave }: { initial: Saving; names: string[]; canDelete: boolean; onClose: () => void; onSave: (s: Saving) => Promise<void> }) {
  const [saving, setSaving] = useState(initial);
  const update = <K extends keyof Saving>(key: K, value: Saving[K]) => setSaving((current) => ({ ...current, [key]: value }));
  const remove = async () => { if (!window.confirm('Hapus setoran ini?')) return; await savingRepository.remove(saving.id); onClose(); };
  return <Modal title={canDelete ? 'Edit setoran' : 'Catat setoran'} onClose={onClose}><form className="form-stack" onSubmit={(e) => { e.preventDefault(); void onSave(saving); }}>
    <label className="field"><span>Tanggal setoran</span><input required type="date" value={saving.tanggal} onChange={(e) => update('tanggal', e.target.value)} /></label>
    <label className="field"><span>Penabung</span><select className="select-control" value={saving.penabung} onChange={(e) => update('penabung', e.target.value)}><option value="">Pilih penabung</option>{names.map((name) => <option key={name}>{name}</option>)}{!names.length && <option value="Lainnya">Lainnya</option>}</select></label>
    <MoneyInput label="Nominal setoran" value={saving.nominal} onChange={(value) => update('nominal', value)} />
    <label className="field"><span>Catatan (opsional)</span><textarea rows={2} value={saving.catatan} onChange={(e) => update('catatan', e.target.value)} placeholder="Misalnya: tabungan bulan November" /></label>
    <button className="primary-button" type="submit">Simpan setoran</button>
    {canDelete && <button className="danger-button full-button" type="button" onClick={() => void remove()}><Trash2 size={16} /> Hapus setoran</button>}
  </form></Modal>;
}

function SettingsPage({ settings, config, onNotify, onSync }: { settings: Record<string, string>; config: LocalConfig | null; onNotify: (m: string, t?: 'success' | 'error') => void; onSync: () => void }) {
  const [values, setValues] = useState({ ...emptySettings, ...settings });
  const [url, setUrl] = useState(config?.scriptUrl ?? '');
  const [token, setToken] = useState(config?.token ?? '');
  const [testing, setTesting] = useState(false);
  useEffect(() => setValues({ ...emptySettings, ...settings }), [settings]);
  useEffect(() => { setUrl(config?.scriptUrl ?? ''); setToken(config?.token ?? ''); }, [config?.scriptUrl, config?.token]);
  const updateValue = (key: keyof typeof emptySettings, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const saveSettings = async () => {
    for (const [key, value] of Object.entries(values)) await setSetting(key, value);
    onNotify('Pengaturan tersimpan.');
  };
  const saveSyncConfig = async () => {
    const current = await ensureLocalConfig();
    await db.local_config.put({ ...current, scriptUrl: url.trim(), token: token.trim() });
    onNotify('Konfigurasi sinkronisasi tersimpan di perangkat ini.');
  };
  const check = async () => { setTesting(true); const result = await testConnection(); setTesting(false); onNotify(result.message, result.ok ? 'success' : 'error'); };
  const exportData = async () => {
    const payload = {
      format: 'wedding-planner-backup', version: 1, exported_at: new Date().toISOString(),
      data: {
        Budget: await db.budget.toArray(), Pembayaran: await db.payments.toArray(), Tabungan: await db.savings.toArray(),
        Pengaturan: await db.settings.toArray(), Todo: await db.todos.toArray(), Vendor: await db.vendors.toArray(),
        Administrasi: await db.administrations.toArray(), Seragam: await db.uniforms.toArray(),
        Seserahan: await db.gifts.toArray(), Rundown: await db.rundown.toArray()
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `wedding-planner-backup-${localToday()}.json`; link.click(); URL.revokeObjectURL(link.href);
    onNotify('Backup JSON berhasil dibuat.');
  };
  const importData = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text()) as { format?: string; data?: Record<string, unknown[]> };
      if (payload.format !== 'wedding-planner-backup' || !payload.data) throw new Error('Format file tidak dikenali.');
      const mapping: Record<string, string> = { Budget: 'budget', Pembayaran: 'payments', Tabungan: 'savings', Pengaturan: 'settings', Todo: 'todos', Vendor: 'vendors', Administrasi: 'administrations', Seragam: 'uniforms', Seserahan: 'gifts', Rundown: 'rundown' };
      await db.transaction('rw', [db.budget, db.payments, db.savings, db.settings, db.todos, db.vendors, db.administrations, db.uniforms, db.gifts, db.rundown], async () => {
        for (const [source, target] of Object.entries(mapping)) {
          const rows = payload.data?.[source];
          if (Array.isArray(rows)) await db.table(target).bulkPut(rows);
        }
      });
      onNotify('Backup berhasil diimpor.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Gagal mengimpor backup.', 'error'); }
  };
  const resetLocal = async () => {
    const first = window.confirm('Reset akan menghapus seluruh data lokal di perangkat ini. Lanjutkan?');
    if (!first || !window.confirm('Konfirmasi terakhir: pastikan data sudah tersinkron atau memiliki file backup. Reset sekarang?')) return;
    await db.transaction('rw', [db.budget, db.payments, db.savings, db.settings, db.todos, db.vendors, db.administrations, db.uniforms, db.gifts, db.rundown], async () => {
      await Promise.all([db.budget.clear(), db.payments.clear(), db.savings.clear(), db.settings.clear(), db.todos.clear(), db.vendors.clear(), db.administrations.clear(), db.uniforms.clear(), db.gifts.clear(), db.rundown.clear()]);
    });
    const retainedConfig = await ensureLocalConfig();
    await db.local_config.put({ ...retainedConfig, lastSyncServerTime: '', lastSyncAt: '', lastSyncStatus: 'never', lastSyncMessage: '' });
    onNotify('Data lokal berhasil direset. Sinkron berikutnya akan menarik ulang seluruh data dari Sheets.');
  };
  const removeSampleData = async () => {
    const sampleIds = ['contoh01', 'contoh02', 'contoh03'];
    await Promise.all(sampleIds.map((id) => budgetRepository.remove(id)));
    onNotify('Data contoh berhasil dihapus.');
  };
  const addSample = async () => {
    if (!window.confirm('Tambahkan 3 item budget contoh? Data ini bisa dihapus lewat tombol Hapus data contoh.')) return;
    const now = new Date().toISOString();
    const samples: BudgetItem[] = [
      { ...createBlankBudget(), id: 'contoh01', kategori: 'Venue', item: 'Gedung pernikahan', estimasi: 12000000, harga_deal: 11000000, created_at: now, updated_at: now },
      { ...createBlankBudget(), id: 'contoh02', kategori: 'Dokumentasi', item: 'Foto dan video', estimasi: 5000000, harga_deal: 0, created_at: now, updated_at: now },
      { ...createBlankBudget(), id: 'contoh03', kategori: 'Katering', item: 'Katering 300 pax', estimasi: 18000000, harga_deal: 16500000, created_at: now, updated_at: now }
    ];
    await db.budget.bulkPut(samples);
    onNotify('Data contoh ditambahkan. Hapus melalui tombol Hapus data contoh jika sudah selesai.');
  };
  return <>
    <PageHeading eyebrow="ATUR RUANG BERDUA" title="Pengaturan" subtitle="Personalisasi rencana dan hubungkan dua perangkat." />
    <section className="settings-card"><div className="settings-card-title"><div className="settings-icon"><Heart size={18} /></div><div><h2>Data pernikahan</h2><p>Informasi dasar untuk dashboard.</p></div></div>
      <div className="form-stack compact"><label className="field"><span>Nama 1</span><input value={values.nama_1} onChange={(e) => updateValue('nama_1', e.target.value)} placeholder="Nama panggilan" /></label><label className="field"><span>Nama 2</span><input value={values.nama_2} onChange={(e) => updateValue('nama_2', e.target.value)} placeholder="Nama panggilan" /></label><label className="field"><span>Tanggal pernikahan</span><input type="date" value={values.tanggal_nikah} onChange={(e) => updateValue('tanggal_nikah', e.target.value)} /></label><MoneyInput label="Target budget" value={Number(values.target_budget || 0)} onChange={(value) => updateValue('target_budget', String(value))} /><MoneyInput label="Target tabungan" value={Number(values.target_tabungan || 0)} onChange={(value) => updateValue('target_tabungan', String(value))} /><label className="field"><span>Tenggat tabungan</span><input type="date" value={values.tenggat_tabungan} onChange={(e) => updateValue('tenggat_tabungan', e.target.value)} /><small>Kosongkan untuk menggunakan tanggal pernikahan.</small></label><button className="primary-button" onClick={() => void saveSettings()}>Simpan data pernikahan</button></div>
    </section>
    <section className="settings-card"><div className="settings-card-title"><div className="settings-icon"><Cloud size={18} /></div><div><h2>Sinkronisasi Google Sheets</h2><p>Gunakan URL dan token yang sama di kedua iPhone.</p></div></div>
      <div className="form-stack compact"><label className="field"><span>URL Apps Script Web App</span><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" autoCapitalize="none" /></label><label className="field"><span>Token rahasia</span><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Masukkan API_TOKEN" autoCapitalize="none" /></label><button className="secondary-button full-button" onClick={() => void saveSyncConfig()}>Simpan konfigurasi</button><div className="sync-actions"><button className="secondary-button" onClick={() => void check()} disabled={testing}>{testing ? 'Menguji…' : 'Uji koneksi'}</button><button className="primary-button" onClick={onSync}>Sinkron sekarang</button></div><p className="settings-footnote">Terakhir sinkron: {config?.lastSyncAt ? formatDate(config.lastSyncAt.slice(0, 10)) + ' · ' + new Date(config.lastSyncAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Belum pernah'}<br />Perubahan tertunda akan dikirim saat online.</p></div>
    </section>
    <section className="settings-card"><div className="settings-card-title"><div className="settings-icon"><Sparkles size={18} /></div><div><h2>Data & cadangan</h2><p>Backup, impor, dan uji aplikasi.</p></div></div><div className="utility-actions"><button className="secondary-button" onClick={() => void exportData()}>Ekspor backup JSON</button><label className="secondary-button file-button">Impor backup JSON<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importData(file); e.currentTarget.value = ''; }} /></label><button className="secondary-button" onClick={() => void addSample()}>Isi data contoh</button><button className="secondary-button" onClick={() => void removeSampleData()}>Hapus data contoh</button><button className="danger-button" onClick={() => void resetLocal()}><Trash2 size={15} /> Reset data lokal</button></div></section>
    <div className="privacy-note"><AlertCircle size={17} /><span>URL dan token disimpan hanya di perangkat ini dan tidak dikirim ke Google Sheets. Data utama tetap tersimpan lokal meskipun sedang offline.</span></div>
  </>;
}

function PwaUpdateNotice() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return <div className="update-banner"><span>Versi baru tersedia.</span><button onClick={() => void updateServiceWorker(true)}>Muat ulang</button></div>;
}

export default App;
