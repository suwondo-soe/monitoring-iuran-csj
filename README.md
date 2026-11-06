# Monitoring Iuran CSJ

Sistem transparansi kas lingkungan untuk 36 rumah CSJ. Halaman warga bersifat
publik dan hanya-baca, sedangkan ruang administrasi hanya dapat dibuka oleh
pengurus yang masuk melalui Supabase Auth.

## Fitur

- Saldo kas kumulatif serta pemasukan dan pengeluaran bulanan
- Tunggakan otomatis sejak Januari 2026 berdasarkan riwayat tarif
- Tagihan lama sampai 31 Desember 2025 yang dapat diisi manual per akun
- Status iuran 35 akun pembayaran untuk 36 rumah
- Rekap pembayaran 2026–2028 dengan status lunas, belum bayar, dibayar sebagian, menunggu konfirmasi, dan total kewajiban sampai tanggal akses
- Pembayaran wajib, tunggakan, dan pembayaran tambahan
- Tanggal transaksi terpisah dari periode iuran, termasuk pembayaran beberapa bulan sekaligus pada tanggal yang sama
- Penerimaan iuran dan penerimaan lain-lain dapat dicatat secara terpisah
- Pencatatan pengeluaran
- Klasifikasi pengeluaran bertingkat untuk Beban, Piutang, dan Lainnya
- Laporan posisi keuangan kumulatif dengan rincian penerimaan dan pengeluaran yang dapat dibuka
- Tampilan publik hanya-baca
- Login admin dengan Supabase Auth
- Pengaturan rekening, saldo awal, dan tarif dari ruang admin
- Penyimpanan PostgreSQL dengan Row Level Security
- Pendataan Household Member per rumah, statistik agregat warga, dan unggah KK opsional
- Mode lokal otomatis jika Supabase belum dikonfigurasi

Tarif awal Januari 2026:

- Rumah dihuni: Rp185.000
- Rumah kosong: Rp145.000
- CSJ 2 dan CSJ 3: satu akun pembayaran gabungan sebesar Rp315.000
- CSJ 6 mulai ditagih Mei 2026 dan CSJ 12 mulai ditagih Agustus 2026

## 1. Siapkan Database Supabase

1. Buka project **Monitoring Iuran CSJ** di Supabase.
2. Buka **SQL Editor** lalu pilih **New query**.
3. Salin seluruh isi
   [`supabase/migrations/202610310001_initial_schema.sql`](supabase/migrations/202610310001_initial_schema.sql).
4. Tempel ke SQL Editor lalu klik **Run** satu kali.
5. Pastikan tabel berikut terlihat di **Table Editor**:
   `profiles`, `houses`, `tariff_history`, `payments`, `expenses`, dan
   `app_settings`.

Untuk mengimpor matriks pembayaran 2026 dan aturan tanggal mulai tagihan,
jalankan juga
[`supabase/migrations/202611010002_import_2026_payments.sql`](supabase/migrations/202611010002_import_2026_payments.sql).
Migrasi ini aman dijalankan ulang karena data impor menggunakan kunci unik yang
tetap.

Untuk menambahkan kategori dan detail pengeluaran, jalankan
[`supabase/migrations/202611010003_expense_categories.sql`](supabase/migrations/202611010003_expense_categories.sql).

Script tersebut juga mengisi 36 rumah dan mengaktifkan kebijakan keamanan. Jika
menemukan tabel dari script Copilot sebelumnya, tabel lama dipindahkan ke schema
`legacy_copilot` agar tidak terhapus dan tidak berbenturan dengan aplikasi baru.

## 2. Buat Login Admin

1. Di Supabase buka **Authentication > Users**.
2. Pilih **Add user > Create new user**.
3. Masukkan email pengurus dan password yang kuat. Aktifkan konfirmasi email
   bila tersedia.
4. Kembali ke **SQL Editor**, ganti email pada perintah berikut, lalu jalankan:

```sql
insert into public.profiles (user_id, role)
select id, 'admin'
from auth.users
where email = 'EMAIL_ANDA'
on conflict (user_id) do update set role = 'admin';
```

Jangan membuat atau menaruh `service_role` key di aplikasi browser.

## 3. Hubungkan Aplikasi Secara Lokal

Di Supabase, buka dialog **Connect** dan salin **Project URL** serta
**Publishable key**. Buat file `.env.local` di folder proyek:

```env
VITE_SUPABASE_URL=https://PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=PASTE_PUBLISHABLE_KEY
```

Lalu jalankan:

```bash
npm install
npm run dev
```

Tanpa `.env.local`, aplikasi tetap berjalan dalam **Local mode** dan menyimpan
data hanya di browser saat ini.

## 4. Deploy ke Vercel

1. Upload/push folder proyek ini ke repository GitHub, misalnya
   `suwondo-soe/monitoring-iuran-csj`.
2. Di Vercel pilih **Add New > Project**, lalu import repository tersebut.
3. Vercel akan mengenali framework **Vite**. Biarkan build command
   `npm run build` dan output directory `dist`.
4. Buka **Project Settings > Environment Variables** dan tambahkan:
   `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Terapkan keduanya ke **Production**, **Preview**, dan **Development**.
6. Klik **Deploy**. Jika environment variable baru ditambahkan setelah deploy,
   lakukan **Redeploy**.

Referensi resmi:

- [Supabase Auth dengan React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Vite di Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Environment variables Vercel](https://vercel.com/docs/environment-variables)

## Database Pemilik, Penyewa, dan Penghuni

Jalankan migrasi `supabase/migrations/202611060007_house_directory.sql`
setelah seluruh migrasi sebelumnya, sebelum merilis frontend baru. Migrasi ini
menambahkan tabel terpisah `house_owners` dan `house_tenants`, bucket privat
`family-cards`, tanggal mulai rumah kosong, dan fungsi transaksi perubahan
penghuni. Tabel penghuni tetap memakai `house_occupancies` agar riwayat iuran
tetap tersambung. Tanggal kepemilikan yang belum diketahui tidak diisi otomatis.

Di **Admin > Data Rumah**, pilih Pemilik Rumah atau Penyewa Rumah untuk
menambah/mengedit nama, rumah, periode, nomor telepon, dan KK. Penyewa juga
menyimpan nama pemilik. KK mendukung PDF/JPG/PNG maksimal 5 MB dan hanya dapat
dibaca admin melalui URL yang berlaku 60 detik. Data pribadi tidak disalin
ke `app_settings` atau data publik. Mode lokal menyimpan data teks di browser;
unggahan KK memerlukan Supabase.

Jalankan juga `supabase/migrations/202611060008_unified_house_residents.sql`.
**Ganti Pemilik** memilih salah satu rumah yang sudah ada, menutup periode pemilik
lama, dan mencatat pemilik baru. Centang **Pemilik mulai tinggal** untuk sekaligus
mengganti penghuni; jika tidak dicentang, penyewa aktif dipertahankan, sedangkan
rumah yang sebelumnya dihuni pemilik menjadi kosong. **Tambah Penyewa** otomatis
memperbarui penghuni dari tanggal mulai tinggal dan menutup periode sebelumnya.
Tanggal mulai tinggal dapat berbeda dari tanggal mulai kepemilikan/sewa.
Tidak perlu lagi mengisi form penghuni kedua. **Edit** memperbarui telepon dan KK;
identitas dan periode historis dipertahankan. Pemilik saat ini dapat mulai tinggal
melalui Edit. **Akhiri masa tinggal** menyimpan tanggal terakhir tinggal dan
menandai rumah kosong sejak hari berikutnya. Semua perubahan terkait di Supabase
berjalan dalam satu transaksi dan mempertahankan jumlah rumah.
Nilai tunggakan mengikuti perhitungan iuran yang ada, berdasarkan rumah dan nama,
bukan saldo manual kedua. Nilai akun gabungan CSJ 02+03 jangan dijumlahkan dua kali.

## Household Member

Jalankan `supabase/migrations/202611070009_household_members.sql` setelah migrasi
sebelumnya. Migrasi ini menambahkan tabel privat `household_submissions` dan
`household_members`, statistik publik yang hanya berisi angka agregat, serta bucket
privat `household-family-cards`.

Warga memilih nomor rumah dan penghuni aktif, lalu mencatat anggota keluarga atau
orang lain yang tinggal bersama. Kode pembaruan 6 digit diperlukan untuk membuka
dan mengubah rincian yang sudah disimpan. Dokumen KK bersifat **opsional**; jika
diunggah, format yang didukung adalah PDF/JPG/PNG maksimal 5 MB. Nama, tanggal
lahir, dan dokumen tidak tersedia melalui tabel publik. Admin dapat melihat rincian
dan membuka dokumen KK (jika ada) melalui tautan privat yang berlaku singkat.
Jalankan juga `supabase/migrations/202611070010_household_statistics_privacy.sql`.
Statistik anggota dan penghuni baru dibuka setelah minimal 10 rumah mengisi form;
sebelum ambang tersebut, API hanya mengembalikan jumlah rumah yang sudah mengisi.

## Perintah Proyek

```bash
npm run dev
npm run lint
npm run build
```
