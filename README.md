# XCrepes POS — MySQL + Vercel

Aplikasi React/Vite dengan Vercel Functions sebagai API dan MySQL sebagai database. Browser tidak pernah terhubung langsung ke MySQL; seluruh credential database hanya tersedia di server.

## Arsitektur

```text
React/Vite → /api (Vercel Functions) → MySQL
```

- Login diverifikasi di server.
- Password akun disimpan sebagai bcrypt hash.
- Semua query dibatasi ke tabel, kolom, dan operator yang dikenal aplikasi.
- Sinkronisasi antardevice memakai satu polling bersama setiap 120 detik, berhenti saat tab tidak terlihat, dan hanya mengambil ulang scope data yang berubah.
- Login gagal dibatasi maksimal 5 kali per kombinasi username/IP dalam 15 menit.
- API membatasi burst request, payload JSON 2 MB, batch 100 baris, dan hasil maksimal 2.000 baris per request.

## 1. Siapkan MySQL

Gunakan MySQL 8.0 atau layanan MySQL cloud. Provider harus mengizinkan koneksi dari Vercel dan sebaiknya menyediakan TLS.

```bash
cp .env.example .env
npm install
npm run db:setup
```

Isi `.env` terlebih dahulu. Gunakan `MYSQL_URL`, atau kombinasi `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, dan `MYSQL_DATABASE`. `INITIAL_ADMIN_PASSWORD` dipakai untuk membuat akun `superadmin` pertama.

Buat `AUTH_SECRET` acak dengan:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Schema juga tersedia di `database/mysql_schema.sql` jika ingin diperiksa atau dijalankan manual. Jika dijalankan manual, akun superadmin tetap perlu dibuat melalui `npm run db:setup`.

## 2. Migrasikan data Supabase

Jangan menonaktifkan Supabase sebelum hasil migrasi diverifikasi.

Tambahkan sementara ke `.env`:

```env
SUPABASE_URL=https://project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key
```

Lalu jalankan:

```bash
npm run db:migrate
```

Skrip membaca seluruh tabel Supabase per halaman, melakukan upsert ke MySQL, dan mengubah password lama menjadi bcrypt hash. Hapus `SUPABASE_SERVICE_ROLE_KEY` dari `.env` dan environment setelah migrasi selesai.

## 3. Jalankan lokal

Untuk frontend saja:

```bash
npm run dev
```

Untuk frontend sekaligus Vercel Functions, instal/login Vercel CLI lalu jalankan:

```bash
npm run dev:vercel
```

Cek koneksi API pada `http://localhost:3000/api/health` (port mengikuti output Vercel CLI).

## 4. Deploy ke Vercel

1. Import repository ke Vercel.
2. Tambahkan environment variables `MYSQL_URL`, `MYSQL_SSL`, `AUTH_SECRET`, dan opsional `MYSQL_CONNECTION_LIMIT`.
3. Jangan tambahkan credential MySQL dengan prefix `VITE_`.
4. Deploy dan buka `/api/health`.
5. Login memakai username `superadmin` dan nilai `INITIAL_ADMIN_PASSWORD` yang dipakai saat setup.

`INITIAL_ADMIN_PASSWORD` dan credential Supabase tidak dibutuhkan oleh runtime Vercel setelah database selesai disiapkan dan dimigrasikan.

## Perintah

```bash
npm run dev          # Vite frontend
npm run dev:vercel   # frontend + API Vercel
npm run build        # production build
npm run db:setup     # buat/update schema dan seed awal
npm run db:migrate   # salin data dari Supabase ke MySQL
```
