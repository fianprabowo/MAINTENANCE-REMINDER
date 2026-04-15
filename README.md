# Vehicle Maintenance Reminder

A full-stack vehicle maintenance tracking application built with Go (Echo), Next.js (App Router), MySQL, and Docker.

## Tech Stack

- **Backend**: Go 1.25 + Echo v4 (Clean Architecture)
- **Frontend**: Next.js 15 (App Router) + TailwindCSS v4
- **Database**: MySQL 8.0
- **Containerization**: Docker + Docker Compose

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

Tunggu sampai log menampilkan `server starting on :8080`, lalu buka:

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost:3000         |
| Backend  | http://localhost:8080/api     |
| MySQL    | localhost:3306               |

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

4. **Frontend** (terminal lain):

   ```bash
   cd frontend
   export NEXT_PUBLIC_API_URL=http://localhost:8080/api
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

#### 3. Frontend

Buka terminal baru:

```bash
cd frontend

# Install dependencies
npm install

# Set environment variable
export NEXT_PUBLIC_API_URL=http://localhost:8080/api

# Jalankan development server
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
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api`      | URL backend dari frontend   |

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
│   └── src/lib/                 # API client, auth, types
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