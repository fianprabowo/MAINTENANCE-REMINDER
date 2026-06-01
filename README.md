# Vehicle Maintenance Reminder

A full-stack vehicle maintenance tracking application built with Go (Echo), Next.js (App Router), MySQL, and Docker.

## Tech Stack

- **Backend (opsional)**: Go 1.25 + Echo v4 (Clean Architecture) — folder `backend/` tetap ada; bisa tidak dijalankan jika memakai Supabase.
- **Frontend**: Next.js 15 (App Router) + TailwindCSS v4 + **Supabase** (`@supabase/supabase-js`) untuk Auth & data.
- **Database**: MySQL 8.0 (stack Docker/Go) **atau** PostgreSQL di **Supabase** (lihat bagian di bawah).
- **Containerization**: Docker + Docker Compose

## Frontend + Supabase (tanpa menjalankan backend Go)

Next.js dapat dipakai **standalone** dengan [Supabase](https://supabase.com/) (Auth + Postgres + Row Level Security). Tidak perlu menjalankan API Go atau MySQL lokal untuk mode ini.

1. Buat project baru di Supabase.
2. Buka **SQL Editor** → jalankan seluruh isi file `supabase/migrations/001_maintenance_reminder.sql` (satu kali).
3. **Authentication** → **Providers** → **Email**: untuk pengembangan lokal, Anda bisa menonaktifkan **Confirm email** agar user langsung aktif setelah signup (opsional).
4. **Project Settings** → **API**: salin **Project URL** dan **anon public** key.
5. Buat `frontend/.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

6. Jalankan frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

**Perilaku auth:** masuk memakai **email + password** (provider Email Supabase). Login hanya dengan nomor telepon tidak didukung di mode ini; nomor tetap bisa disimpan di profil lewat form registrasi (metadata).

**Validasi mileage:** aturan “nilai baru **lebih besar** dari pembacaan terakhir” ditegakkan di Postgres (trigger Supabase). Frontend tidak memanggil API Go.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 20.x
- [Docker Compose](https://docs.docker.com/compose/install/) >= 2.x

Untuk development tanpa Docker:

- [Go](https://go.dev/dl/) >= 1.25
- [Node.js](https://nodejs.org/) >= 20.x
- [MySQL](https://dev.mysql.com/downloads/) >= 8.0

## Cara Menjalankan

### Opsi 1: Docker Compose (Recommended)

Cara paling mudah, satu perintah untuk menjalankan seluruh stack (MySQL + Backend + Frontend).

```bash
# 1. Clone repository
git clone <repo-url>
cd MAINTENANCE-REMINDER

# 2. Copy environment file
cp .env.example .env

# 3. (Opsional) Edit .env sesuai kebutuhan, misalnya ganti JWT_SECRET
#    nano .env

# 4. Build dan jalankan semua service
docker compose up --build
```

Tunggu sampai service siap, lalu buka:

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost:3000         |
| Backend  | http://localhost:8080/api (opsional; UI Next tidak memakainya) |
| MySQL    | localhost:3306               |

Isi `.env` dengan `NEXT_PUBLIC_SUPABASE_*` dan `SUPABASE_SERVICE_ROLE_KEY` agar container **frontend** bisa auth + `/api/access`. Tanpa itu, halaman Next tidak akan terhubung ke data.

Untuk menjalankan di background:

```bash
docker compose up --build -d
```

Untuk menghentikan semua service:

```bash
docker compose down
```

Untuk menghentikan dan menghapus data MySQL (reset database):

```bash
docker compose down -v
```

### Opsi 2: Hanya MySQL di Docker (Backend & Frontend di terminal)

Cocok jika Anda ingin database terisolasi di container, sementara Go dan Next.js dijalankan langsung di mesin Anda.

1. **Siapkan `.env`** (salin dari `.env.example` jika belum). Pastikan nilai `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, dan `MYSQL_ROOT_PASSWORD` konsisten—container MySQL membuat user/database dari variabel ini saat pertama kali jalan.

2. **Jalankan hanya service MySQL:**

   ```bash
   docker compose up mysql -d
   ```

   Tunggu sampai healthy (beberapa detik pertama kali image di-pull).

3. **Hubungkan backend ke MySQL di host:** dari sisi proses Go, MySQL “terlihat” di `127.0.0.1:3306` (bukan hostname `mysql` yang dipakai antar-container).

   ```bash
   cd backend
   export MYSQL_HOST=127.0.0.1
   export MYSQL_PORT=3306
   export MYSQL_DATABASE=maintenance_reminder
   export MYSQL_USER=appuser
   export MYSQL_PASSWORD=apppassword
   export APP_PORT=8080
   export JWT_SECRET=change-me-to-a-strong-secret
   export JWT_EXPIRY_HOURS=72
   go run ./cmd/server
   ```

   Sesuaikan `MYSQL_USER` / `MYSQL_PASSWORD` dengan yang ada di `.env` Anda.

4. **Frontend** (terminal lain) — pakai Supabase, **bukan** URL Go:

   ```bash
   cd frontend
   # salin dari Project Settings → API di Supabase (sudah di frontend/.env.local)
   export NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   export NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   npm run dev
   ```

**Catatan:**

- Port **3306** di host harus bebas. Jika MySQL lokal (non-Docker) sudah memakai 3306, hentikan dulu atau ubah mapping port di `docker-compose.yml` (misalnya `"3307:3306"`) dan set `MYSQL_PORT=3307` untuk backend.
- Schema + seed admin dijalankan otomatis lewat volume `schema.sql` pada **inisialisasi volume MySQL pertama**. Jika database sudah pernah dibuat dan Anda ingin reset, gunakan `docker compose down -v` lalu `docker compose up mysql -d` lagi.

### Opsi 3: Development Lokal (Tanpa Docker)

Jalankan masing-masing service secara terpisah.

#### 1. Database

Pastikan MySQL 8.0 berjalan, lalu buat database dan jalankan schema:

```bash
mysql -u root -p -e "CREATE DATABASE maintenance_reminder;"
mysql -u root -p maintenance_reminder < backend/migrations/schema.sql
```

#### 2. Backend

```bash
cd backend

# Set environment variables
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_DATABASE=maintenance_reminder
export MYSQL_USER=root
export MYSQL_PASSWORD=yourpassword
export APP_PORT=8080
export JWT_SECRET=change-me-to-a-strong-secret
export JWT_EXPIRY_HOURS=72

# Download dependencies
go mod tidy

# Jalankan server
go run ./cmd/server
```

Backend berjalan di http://localhost:8080.

#### 3. Frontend (Supabase)

Buka terminal baru:

```bash
cd frontend

npm install

# Buat frontend/.env.local berisi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY
# (lihat bagian “Frontend + Supabase” di atas). Tidak ada variabel URL ke backend Go.

npm run dev
```

Frontend berjalan di http://localhost:3000.

## Default Admin

Setelah pertama kali dijalankan, database otomatis di-seed dengan akun admin:

| Field    | Value                |
|----------|----------------------|
| Email    | `admin@example.com`  |
| Password | `admin123`           |

## Environment Variables

| Variable            | Default                            | Keterangan                  |
|---------------------|------------------------------------|-----------------------------|
| `MYSQL_HOST`        | `mysql`                            | Hostname MySQL              |
| `MYSQL_PORT`        | `3306`                             | Port MySQL                  |
| `MYSQL_DATABASE`    | `maintenance_reminder`             | Nama database               |
| `MYSQL_USER`        | `appuser`                          | Username MySQL              |
| `MYSQL_PASSWORD`    | `apppassword`                      | Password MySQL              |
| `MYSQL_ROOT_PASSWORD` | `rootpassword`                   | Root password MySQL         |
| `APP_PORT`          | `8080`                             | Port backend                |
| `JWT_SECRET`        | `change-me-to-a-strong-secret`     | Secret key untuk JWT        |
| `JWT_EXPIRY_HOURS`  | `72`                               | Masa berlaku token (jam)    |
| `NEXT_PUBLIC_SUPABASE_URL` | —                         | URL project Supabase (frontend) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | —                    | Anon key Supabase (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | —                       | Hanya server Next (`/api/access`); jangan expose ke browser |

## Project Structure

```
├── backend/
│   ├── cmd/server/              # Entry point aplikasi
│   ├── internal/
│   │   ├── domain/              # Entity + repository interface
│   │   ├── usecase/             # Business logic
│   │   ├── repository/mysql/    # Implementasi MySQL
│   │   └── delivery/http/       # Handler, middleware, router
│   ├── pkg/                     # Config, response, validator
│   └── migrations/schema.sql    # DDL + seed data
├── frontend/
│   ├── src/app/                 # Next.js App Router pages
│   ├── src/components/          # Reusable UI components
│   └── src/lib/                 # Supabase client & services, auth, types
├── docker-compose.yml
├── .env.example
└── .env
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Register user baru |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/profile | Yes | Profil user aktif |
| GET | /api/vehicles | Yes | List kendaraan |
| POST | /api/vehicles | Yes | Tambah kendaraan |
| GET | /api/vehicles/:id | Yes | Detail kendaraan |
| PUT | /api/vehicles/:id | Yes | Update kendaraan |
| POST | /api/vehicles/:id/mileage | Yes | Catat kilometer |
| GET | /api/vehicles/:id/history | Yes | Riwayat kilometer |
| POST | /api/vehicles/:id/reminder | Yes | Buat reminder service |
| GET | /api/vehicles/:id/reminders | Yes | List reminder |

### Contoh Request

**Login:**

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

**Tambah kendaraan (gunakan token dari login):**

```bash
curl -X POST http://localhost:8080/api/vehicles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"Honda Beat","type":"motorcycle","brand":"Honda","year":2023,"fuel_level":80}'
```

## Features

- Registrasi dan login (email atau nomor telepon)
- Autentikasi JWT
- Manajemen kendaraan (motor/mobil)
- Pencatatan kilometer dengan timeline dan grafik
- Reminder service dengan deteksi overdue
- Dark mode
- Desain responsive (mobile-first)

## Troubleshooting

**Port sudah terpakai:**

```bash
# Cek proses yang menggunakan port
lsof -i :3000
lsof -i :8080
lsof -i :3306
```

**Reset database:**

```bash
docker compose down -v
docker compose up --build
```

**Backend tidak bisa connect ke MySQL:**

Pastikan MySQL sudah healthy sebelum backend start. Jika pakai Docker, ini otomatis ditangani oleh health check. Jika lokal, pastikan MySQL sudah berjalan dan credentials benar.


be:
export MYSQL_HOST=localhost JWT_SECRET=dev-secret APP_PORT=8080 MYSQL_USER=root MYSQL_PASSWORD=yourpass MYSQL_DATABASE=maintenance_reminder
go run ./cmd/server

fe:
npm run dev