# Monitoring Iuran CSJ

Sistem transparansi kas lingkungan untuk 36 rumah CSJ. Halaman warga bersifat
publik dan hanya-baca, sedangkan ruang administrasi hanya dapat dibuka oleh
pengurus yang masuk melalui Supabase Auth.

## Fitur

- Saldo kas kumulatif serta pemasukan dan pengeluaran bulanan
- Tunggakan otomatis sejak Januari 2026 berdasarkan riwayat tarif
- Tagihan lama sampai 31 Desember 2025 yang dapat diisi manual per akun
- Status iuran 35 akun pembayaran untuk 36 rumah
- Rekap pembayaran Januari–Desember dengan status lunas/belum lunas per bulan
- Pembayaran wajib, tunggakan, dan pembayaran tambahan
- Pencatatan pengeluaran
- Tampilan publik hanya-baca
- Login admin dengan Supabase Auth
- Pengaturan rekening, saldo awal, dan tarif dari ruang admin
- Penyimpanan PostgreSQL dengan Row Level Security
- Mode lokal otomatis jika Supabase belum dikonfigurasi

Tarif awal Januari 2026:

- Rumah dihuni: Rp185.000
- Rumah kosong: Rp145.000
- CSJ 2 dan CSJ 3: satu akun pembayaran gabungan sebesar Rp315.000

## 1. Siapkan Database Supabase

1. Buka project **Monitoring Iuran CSJ** di Supabase.
2. Buka **SQL Editor** lalu pilih **New query**.
3. Salin seluruh isi
   [`supabase/migrations/202610310001_initial_schema.sql`](supabase/migrations/202610310001_initial_schema.sql).
4. Tempel ke SQL Editor lalu klik **Run** satu kali.
5. Pastikan tabel berikut terlihat di **Table Editor**:
   `profiles`, `houses`, `tariff_history`, `payments`, `expenses`, dan
   `app_settings`.

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

## Perintah Proyek

```bash
npm run dev
npm run lint
npm run build
```
