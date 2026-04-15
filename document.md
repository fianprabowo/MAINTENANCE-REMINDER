You are a senior full-stack engineer. Build a production-ready web application with clean architecture (Uncle Bob principles), scalable structure, and clean code.

## 🚀 Tech Stack

* Frontend: Next.js (App Router) + TailwindCSS (Reference TIX-CORPORATE-OPEN-API-FE https://github.com/tiket/TIX-CORPORATE-OPEN-API-FE)
    - tidak usah pakai mkcert
    - tidak usah pakai tiket passport
* Backend: Golang (Echo framework)
* Database: MySQL (latest)
* Containerization: Docker + Docker Compose

## 🧱 Architecture (MANDATORY)

Follow Clean Architecture:

* Domain layer (entities, business rules)
* Usecase layer (application logic)
* Interface layer (handlers/controllers)
* Infrastructure layer (DB, external services)

Backend folder structure example:

* /cmd
* /internal/domain
* /internal/usecase
* /internal/repository
* /internal/delivery/http
* /pkg

## 🔐 Authentication

* Login & Register:

  * Email OR Phone number
  * Password (hashed using bcrypt)
* JWT-based authentication
* Seed default admin:

  * email: [admin@example.com](mailto:admin@example.com)
  * password: admin123

## 🚗 Core Features

### 1. User

* Register
* Login
* Profile

### 2. Vehicle Management

* Add vehicle:

  * name
  * type (motorcycle, car)
  * brand
  * year
* List vehicles
* Vehicle detail

### 3. Mileage Tracking

* Input current mileage (KM)
* Store history of mileage
* Show latest mileage
* Show history (timeline)

### 4. Vehicle Condition

* Fuel level (manual input)
* Notes (optional)
* Status:

  * good
  * warning
  * critical

### 5. Service Reminder

* Light service (e.g oil change)
* Heavy service
* Based on:

  * KM interval
  * Date interval
* Show:

  * next service estimation
  * overdue warning

---

## 🗄️ Database Design (NO FOREIGN KEY)

Use MySQL without foreign key constraints.

Tables:

* users
* vehicles
* mileage_logs
* service_records
* reminders

Add:

* indexes (IMPORTANT)

  * users: email, phone
  * vehicles: user_id
  * mileage_logs: vehicle_id, created_at (composite index)
  * reminders: vehicle_id, next_due_date

---

## 🎨 Frontend (Next.js)

### UI Requirements:

* Mobile-first responsive design
* Clean modern UI (based on vehicle monitoring app)
* Pages:

  * Login / Register
  * Dashboard
  * Add Vehicle
  * Vehicle Detail
  * Add Mileage
  * History
  * Reminder

### Dashboard:

* Greeting (e.g "Good Morning, Akbar")
* Vehicle cards
* Status color:

  * green (good)
  * yellow (warning)
  * red (critical)

### Vehicle Detail:

* Current KM
* Fuel status
* Service status
* History timeline

### Styling:

* TailwindCSS
* Rounded cards
* Soft shadows
* Clean spacing

---

## 🔌 API Design

REST API:

* POST /auth/register
* POST /auth/login
* GET /vehicles
* POST /vehicles
* GET /vehicles/:id
* POST /vehicles/:id/mileage
* GET /vehicles/:id/history
* POST /vehicles/:id/reminder

---

## 🐳 Docker Setup

Create:

* docker-compose.yml with:

  * frontend (Next.js)
  * backend (Go)
  * mysql

Include:

* environment variables
* volume for MySQL
* network

Command:

* docker-compose up --build

---

## 🧪 Additional Requirements

* Use environment variables (.env)
* Logging middleware
* Error handling standardization
* Validation (request validation)
* Pagination for list APIs
* Clean code naming
* Separation of concerns
* No hardcoded values

---

## ✨ Bonus Features (if possible)

* Dark mode
* Simple chart for mileage
* Loading skeleton
* Toast notification

---

## 📦 Output Expectation

Generate:

* Full project structure
* Backend implementation (Go + Echo)
* Frontend (Next.js pages & components)
* Docker setup
* SQL schema

Make sure everything can run with:
docker-compose up --build
