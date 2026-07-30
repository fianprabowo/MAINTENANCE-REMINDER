# Vehicle Maintenance Reminder

Aplikasi web pelacak servis kendaraan berbasis **Next.js (App Router)** + **Supabase** (Postgres + Auth + Row Level Security). Tidak ada backend kustom — seluruh data flow lewat Supabase langsung dari browser, plus satu route Next.js (`/api/access`) untuk gerbang akses.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TailwindCSS v4
- **Auth & Data**: Supabase (`@supabase/supabase-js`) — Email/password, Postgres, RLS
- **Containerization (opsional)**: Docker + Docker Compose untuk build image production

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.x
- Akun [Supabase](https://supabase.com/) (free tier cukup)
- (Opsional) [Docker](https://docs.docker.com/get-docker/) >= 20.x untuk containerized app

## Setup Supabase

1. Buat project baru di Supabase.
2. Buka **SQL Editor** → jalankan seluruh isi file `supabase/migrations/001_initial_schema.sql` (satu kali). Untuk teardown total, jalankan `supabase/rollback/001_drop_all.sql`.
3. Jalankan juga `supabase/migrations/002_service_receipts_storage.sql` (bucket private `service-receipts` + kolom `service_records.receipt_path`). Rollback: `supabase/rollback/002_service_receipts_storage.sql`.
4. **Authentication** → **Providers** → **Email**: untuk pengembangan lokal, Anda bisa menonaktifkan **Confirm email** agar user langsung aktif setelah signup (opsional).
5. **Project Settings** → **API**: salin **Project URL**, **anon public** key, dan **service_role** key.

## Cara Menjalankan

### Opsi 1: Development Lokal (Recommended)

```bash
npm install
```

Buat `.env.local` di root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Server-only, tidak akan terkirim ke browser. Dipakai oleh route /api/access.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Jalankan:

```bash
npm run dev
```

Aplikasi berjalan di http://localhost:3000.

### Opsi 2: Docker Compose

Cocok untuk mensimulasikan build production di lokal.

```bash
# Salin env (di root repo)
cp .env.example .env
# Isi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

docker compose up --build
```

Buka http://localhost:3000.

Stop:

```bash
docker compose down
```

## Auth Behavior

- Login pakai **email + password** (provider Email Supabase). Login hanya dengan nomor telepon tidak didukung; nomor tetap bisa disimpan di profil lewat form registrasi (sebagai metadata).
- Akses ke aplikasi digerbangkan oleh tabel `public.user_access_codes`. Untuk meng-allow user, insert satu row dengan `access_code` yang sesuai. Frontend memverifikasi via route Next.js `/api/access` (server-only, pakai `SUPABASE_SERVICE_ROLE_KEY`).

## Validasi Mileage

Aturan "nilai baru **lebih besar** dari pembacaan terakhir" ditegakkan oleh trigger di Postgres (lihat migration). Tidak ada validasi tambahan di server-side aplikasi karena tidak ada server-side aplikasi — RLS + trigger Supabase yang jadi single source of truth.

## Environment Variables

| Variable                        | Wajib | Keterangan                                                                |
|---------------------------------|-------|---------------------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | ya    | URL project Supabase (frontend, bisa di-expose ke browser).               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya    | Anon key Supabase (frontend, bisa di-expose).                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | ya    | Service role key — **server-only**, hanya untuk route `/api/access`. Jangan expose ke browser. |

## Project Structure

```
├── src/
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # Reusable UI components
│   └── lib/                     # Supabase client & services, auth, types
├── public/                      # Static assets
├── supabase/
│   ├── migrations/              # DDL + seed (jalankan di Supabase SQL Editor)
│   └── rollback/                # Drop scripts
├── next.config.ts
├── package.json
├── Dockerfile
├── .dockerignore
├── docker-compose.yml
├── .env.example
└── .env.local
```

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Import project di [Vercel](https://vercel.com/new) — preset **Next.js** akan auto-detect. Root directory: `./`. Build/install command biarkan default.
3. Set Environment Variables (Production & Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (mark **Sensitive**)
   - `APP_ACCESS_CODE`, `APP_ACCESS_SUPABASE_EMAIL`, `APP_ACCESS_SUPABASE_PASSWORD` (semua **Sensitive**)
4. Deploy. Catatan: `output: "standalone"` di `next.config.ts` aman — Vercel mengabaikan opsi tersebut (relevan hanya untuk Docker).

## Features

- Registrasi & login (email + password, lewat Supabase Auth)
- Manajemen kendaraan (motor)
- Pencatatan kilometer dengan timeline & grafik
- Reminder service (light / heavy / oil change) dengan deteksi overdue
- Tracking kondisi part (rem, ban, dll.)
- Fuel level + estimasi konsumsi
- Notifikasi (lewat tabel di Supabase)
- Dark mode
- Desain mobile-first

## Troubleshooting

**Port 3000 sudah terpakai:**

```bash
lsof -i :3000
```

**Auth gagal / user tidak bisa login:**

- Pastikan email user sudah confirmed (atau matikan **Confirm email** di Supabase).
- Pastikan ada row di `public.user_access_codes` untuk user tersebut.
- Cek bahwa `SUPABASE_SERVICE_ROLE_KEY` benar — `/api/access` butuh ini untuk verify.

**Data tidak muncul setelah login:**

- Cek RLS policies di Supabase. Migration `001_initial_schema.sql` sudah set policy yang membatasi data per `auth.uid()`. Jika di-modify dan policy hilang, query akan return 0 rows.
