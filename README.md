# Wedding Planner — PWA pribadi

Aplikasi perencana pernikahan offline-first untuk dua pengguna. Data utama disimpan di IndexedDB pada masing-masing iPhone, lalu disinkronkan ke Google Sheets melalui Google Apps Script Web App.

## Fitur Fase 1

- **Beranda:** hitung mundur, ringkasan budget, tabungan, pembayaran yang perlu diperhatikan, dan aksi cepat.
- **Budget:** item per kategori, estimasi vs harga deal, pencarian/filter, detail pembayaran, tandai lunas, dan soft delete.
- **Tabungan:** setoran per penabung, progres target, kalkulator kebutuhan per bulan/minggu, edit dan hapus setoran.
- **Pengaturan:** data pernikahan, konfigurasi sinkronisasi, uji koneksi, ekspor/impor JSON, data contoh, dan reset data lokal.
- **Offline-first:** data tetap dapat dibaca/ditulis tanpa internet. Sinkron berjalan saat aplikasi dibuka, kembali ke foreground, online, beberapa saat setelah perubahan, atau manual.

Todo, Vendor, Administrasi, Seragam, Seserahan, dan Rundown sudah disediakan di skema IndexedDB dan dukungan sheet Apps Script, tetapi UI-nya ditunda ke fase berikutnya.

---

## 1. Menambahkan `Sync.gs` ke Apps Script

1. Buka Google Spreadsheet Wedding Planner yang sudah memiliki sheet `Pengaturan`, `Budget`, `Pembayaran`, `Tabungan`, dan sheet fase berikutnya.
2. Pilih **Ekstensi → Apps Script**.
3. Jangan hapus atau mengganti file skrip setup yang sudah ada.
4. Klik tombol **+** di panel Files, pilih **Script**, lalu beri nama `Sync`.
5. Salin seluruh isi file `Sync.gs` dari proyek ini ke file baru tersebut, lalu simpan.
6. Pastikan skrip setup yang lama masih mendefinisikan `META`, `SHEETS`, `RUPIAH_COLS`, `DROPDOWNS`, `PENGATURAN_DEFAULT`, `setupWeddingPlanner`, `onEditAuto`, dan helper yang sudah ada. File ini sengaja tidak mendefinisikan ulang nama-nama tersebut.
7. Di dropdown fungsi editor Apps Script, pilih `SYNC_installSettingsTrigger`, lalu klik **Run** satu kali dan setujui otorisasi. Trigger tambahan ini mencatat perubahan manual pada sheet `Pengaturan` karena sheet tersebut tidak memiliki kolom metadata.

> Jalankan setup awal spreadsheet yang sudah tersedia terlebih dahulu bila spreadsheet belum memiliki header atau validasi dropdown.

## 2. Membuat token rahasia

1. Di Apps Script buka **Project Settings** (ikon roda gigi).
2. Cari bagian **Script Properties**, lalu klik **Add script property**.
3. Isi:
   - Property: `API_TOKEN`
   - Value: token acak yang panjang, minimal 32 karakter.
4. Simpan. Jangan menaruh token pada kode sumber, README publik, atau spreadsheet.

Cara membuat token di Terminal macOS:

```bash
openssl rand -hex 32
```

Salin hasilnya sebagai nilai `API_TOKEN`. Token yang sama akan dimasukkan ke aplikasi di kedua iPhone.

## 3. Deploy Apps Script sebagai Web App

1. Klik **Deploy → New deployment**.
2. Klik ikon roda gigi di samping *Select type*, lalu pilih **Web app**.
3. Atur:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Klik **Deploy**, lalu selesaikan otorisasi bila diminta.
5. Salin **Web app URL** yang berakhiran `/exec`. Jangan gunakan URL `/dev`.
6. Di kemudian hari, setiap kali kode Apps Script berubah, buka **Deploy → Manage deployments → Edit** (ikon pensil), pilih **New version**, lalu klik **Deploy**. URL `/exec` biasanya tetap sama untuk deployment yang diedit; periksa kembali bila membuat deployment baru.

Akses Web App memang disetel *Anyone* agar kedua iPhone dapat mengirim request, tetapi setiap request `ping`/`sync` tetap wajib membawa token yang dicocokkan dengan Script Properties `API_TOKEN`.

## 4. Menjalankan lokal (opsional untuk pengujian)

Pastikan Node.js 20 atau lebih baru tersedia.

```bash
npm install
npm run dev
```

Buka URL lokal yang ditampilkan Vite. Build produksi dan unit test:

```bash
npm test
npm run build
```

## 5. Deploy ke GitHub Pages

1. Buat repository GitHub baru, misalnya `wedding-planner`.
2. Salin seluruh isi folder proyek ini ke repository tersebut.
3. (Opsional) Jalankan `npm install` dan commit `package-lock.json` agar versi dependensi terkunci. Workflow tetap dapat memasang dependensi dengan `npm install` bila file lock belum dibuat.
4. Push branch `main` ke GitHub.
5. Buka repository **Settings → Pages**.
6. Pada **Build and deployment → Source**, pilih **GitHub Actions**.
7. Workflow `.github/workflows/deploy.yml` akan menjalankan test, build, dan deploy otomatis setiap ada push ke `main`.
8. Setelah workflow sukses, buka alamat GitHub Pages yang diberikan GitHub. Aplikasi dibangun dengan `base: './'`, sehingga bisa berjalan di root atau sub-path repository.

## 6. Memasang pada iPhone pertama

1. Buka alamat GitHub Pages menggunakan **Safari** (bukan Chrome iOS).
2. Tekan tombol **Bagikan**.
3. Pilih **Tambah ke Layar Utama** (*Add to Home Screen*), lalu konfirmasi.
4. Buka aplikasi dari ikon Wedding Planner di Home Screen. Mode ini membuat aplikasi berjalan sebagai standalone PWA dan membantu menjaga penyimpanan lokal.
5. Masuk ke **Pengaturan → Data pernikahan**, isi nama, tanggal pernikahan, target budget/tabungan, dan tenggat tabungan.
6. Masuk ke **Sinkronisasi Google Sheets**, masukkan URL `/exec` dan token `API_TOKEN`, lalu tekan **Simpan konfigurasi**.
7. Tekan **Uji koneksi**. Jika valid, tekan **Sinkron sekarang**.

## 7. Memasang pada iPhone pasangan

Ulangi langkah pemasangan Safari → Bagikan → Tambah ke Layar Utama pada iPhone pasangan. Gunakan URL GitHub Pages yang sama, URL Apps Script `/exec` yang sama, serta token yang sama. Setelah sinkron pertama, data dari perangkat pertama akan ditarik ke perangkat kedua.

Konfigurasi URL/token disimpan secara lokal pada masing-masing perangkat dan tidak dikirim ke Google Sheets. Perangkat harus online untuk sinkronisasi; perubahan offline akan tetap disimpan lokal dan dikirim saat koneksi kembali.

## 8. Backup dan reset

- **Ekspor backup JSON:** Pengaturan → Data & cadangan → Ekspor backup JSON. Simpan file di tempat aman.
- **Impor backup JSON:** pilih file backup yang sebelumnya diekspor dari aplikasi ini. Data dengan ID yang sama akan diperbarui.
- **Reset data lokal:** memerlukan dua konfirmasi. Tindakan ini hanya menghapus database aplikasi pada perangkat yang sedang digunakan; data Google Sheets tidak dihapus.

## 9. Troubleshooting

| Gejala | Hal yang perlu diperiksa |
|---|---|
| Token tidak cocok / `UNAUTHORIZED` | Pastikan token di kedua iPhone sama persis dengan Script Properties `API_TOKEN`. Hindari spasi di awal/akhir. |
| Uji koneksi gagal | Pastikan URL lengkap berakhiran `/exec`, deployment bertipe Web app, dan aksesnya `Anyone`. |
| Kode Apps Script sudah diubah tetapi aplikasi tetap gagal | Buka Manage deployments, pilih **New version**, lalu Deploy ulang. |
| Data dari HP lain belum muncul | Pastikan kedua HP memakai spreadsheet, URL `/exec`, dan token yang sama. Tekan Sinkron sekarang pada kedua perangkat saat online. |
| Data lokal tidak terlihat setelah lama tidak dibuka | Buka aplikasi dari ikon Home Screen, bukan tab Safari biasa. iOS dapat mengelola/menghapus data situs yang jarang digunakan. Ekspor backup secara berkala. |
| Aplikasi tidak terbuka offline | Pastikan aplikasi pernah dibuka online setidaknya sekali setelah versi terbaru di-deploy, lalu buka lagi dari ikon Home Screen. Service worker perlu mengunduh aset untuk cache. |
| Tanggal terlihat bergeser | Isi tanggal melalui kontrol tanggal aplikasi. Format yang disimpan adalah `YYYY-MM-DD`; hindari mengubah format kolom tanggal menjadi format bebas secara manual. |
| Sinkron gagal setelah perubahan Apps Script | Pastikan `Sync.gs` disimpan dan deployment sudah dibuat sebagai versi baru. Periksa juga trigger `SYNC_onEditSettings` jika perubahan manual pada sheet Pengaturan tidak terbaca. |

## Catatan sinkronisasi dan keamanan

- Konflik record menggunakan **last-write-wins** berdasarkan `updated_at`; jika timestamp sama, versi server menang.
- Pull memakai `lastSyncServerTime` dikurangi toleransi dua menit, lalu merge dilakukan secara idempotent.
- Setiap tabel data menggunakan `id`, `created_at`, `updated_at`, `deleted`. Penghapusan adalah soft delete.
- Sheet `Pengaturan` tidak memiliki metadata sesuai skema. Untuk mendukung LWW pada key/value, timestamp-nya disimpan di Script Properties dengan prefix `SYNC_SETTING_TS_`; trigger `SYNC_onEditSettings` memperbarui timestamp ketika key diedit langsung di Sheets.
- Token adalah shared secret, bukan sistem autentikasi per pengguna. Siapa pun yang memperoleh URL dan token dapat mengakses endpoint sinkronisasi. Jaga token tetap rahasia.
- Jangan menghapus/menamai ulang kolom header spreadsheet yang telah ditentukan. Kode memetakan kolom berdasarkan nama header, sehingga perubahan urutan kolom masih aman.

## Asumsi implementasi

1. Apps Script merupakan skrip **bound** pada spreadsheet Wedding Planner, sehingga `SpreadsheetApp.getActiveSpreadsheet()` mengarah ke spreadsheet yang benar.
2. `SHEETS` pada skrip setup memuat nama-nama sheet yang diizinkan sebagai key, value, atau daftar string. Endpoint hanya memproses nama sheet dari whitelist tersebut ditambah `Pengaturan`.
3. Kolom header yang ditentukan sudah tersedia pada baris pertama. Fungsi sinkronisasi tidak membuat atau mengubah header spreadsheet.
4. Timestamp `Pengaturan` disimpan di Script Properties karena sheet tersebut secara eksplisit tidak memiliki kolom metadata. Jika seseorang mengubah nilai secara manual, trigger tambahan memperbarui timestamp key tersebut.
5. Penyimpanan IndexedDB bersifat per perangkat. Sinkronisasi dengan Sheets diperlukan untuk berbagi data antar iPhone; aplikasi tidak menjanjikan sinkronisasi instan saat perangkat offline.
6. Notifikasi push, modul fase 2 (Todo, Vendor, Administrasi, Seragam, Seserahan, Rundown), dan integrasi pihak ketiga belum dibuat pada fase ini.
