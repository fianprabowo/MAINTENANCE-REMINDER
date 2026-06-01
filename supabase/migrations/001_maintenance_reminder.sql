-- Maintenance Reminder — full Supabase schema (single migration for fresh installs / reset).
-- Run in Supabase SQL Editor after creating a project (role postgres / dashboard).
-- Requires: Auth (email) enabled. Optionally disable "Confirm email" for local dev under Auth → Providers.
-- Trigger syntax: EXECUTE PROCEDURE (kompatibel PG11–17). Jangan pakai EXECUTE FUNCTION kecuali PG14+.

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_phone on public.profiles (phone) where phone is not null;

-- New auth user → profile row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'User'),
    'user',
    nullif(nullif(trim(new.raw_user_meta_data->>'phone'), ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Motorcycle oil reference (categories before vehicles FK)
-- ---------------------------------------------------------------------------
create table if not exists public.motorcycle_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_display text not null,
  engine_oil_km_min int,
  engine_oil_km_max int,
  gearbox_oil_km_min int,
  gearbox_oil_km_max int,
  has_engine_oil_interval boolean not null default true,
  has_gearbox_oil_interval boolean not null default false,
  side_oil_note text,
  tips text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.motorcycle_categories (slug, name_display, engine_oil_km_min, engine_oil_km_max, gearbox_oil_km_min, gearbox_oil_km_max, has_engine_oil_interval, has_gearbox_oil_interval, side_oil_note, tips, sort_order)
values
  (
    'matic',
    'Motor Matic',
    2000, 3000,
    6000, 8000,
    true, true,
    null,
    'Kurangi interval jika sering macet, jarak pendek, atau RPM tinggi. Cek buku manual pabrikan. Lebih baik ganti lebih awal daripada terlambat.',
    1
  ),
  (
    'bebek',
    'Motor Bebek',
    2000, 4000,
    null, null,
    true, false,
    null,
    'Kurangi interval jika sering macet atau jarak pendek.',
    2
  ),
  (
    'sport',
    'Motor Besar',
    3000, 6000,
    null, null,
    true, false,
    null,
    'Interval lebih panjang pada pemakaian touring; lebih pendek jika track / RPM tinggi.',
    3
  )
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Vehicles & related
-- ---------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type text not null check (type in ('motorcycle', 'car')),
  brand text not null,
  year int not null check (year >= 1900 and year <= 2100),
  fuel_level int not null default 100 check (fuel_level >= 0 and fuel_level <= 100),
  notes text,
  status text not null default 'good' check (status in ('good', 'warning', 'critical')),
  motorcycle_category_id uuid references public.motorcycle_categories (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vehicles_user on public.vehicles (user_id);
create index if not exists idx_vehicles_motorcycle_category on public.vehicles (motorcycle_category_id);

create table if not exists public.mileage_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  mileage int not null check (mileage >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_mileage_vehicle_created on public.mileage_logs (vehicle_id, created_at desc);

-- Mileage must be >= latest reading for that vehicle (same rule as Go backend)
create or replace function public.enforce_mileage_monotonic()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  latest_max int;
begin
  -- New row not visible yet on INSERT, so MAX reflects previous readings only.
  -- Hindari nama variabel seperti max_* dekat agregat max() — bisa diparsing sebagai relasi (42P01).
  latest_max := (
    select coalesce(max(ml.mileage), -1)
    from public.mileage_logs ml
    where ml.vehicle_id = new.vehicle_id
  );

  if latest_max >= 0 and new.mileage < latest_max then
    raise exception 'mileage must be greater than or equal to the latest recorded value';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mileage_monotonic on public.mileage_logs;
create trigger trg_mileage_monotonic
  before insert on public.mileage_logs
  for each row execute procedure public.enforce_mileage_monotonic();

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_type text not null check (service_type in ('light', 'heavy')),
  km_interval int not null default 0,
  date_interval_days int not null default 0,
  last_service_km int not null default 0,
  last_service_date date,
  next_due_km int not null default 0,
  next_due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reminders_vehicle on public.reminders (vehicle_id);

create table if not exists public.vehicle_oil_service (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  last_engine_oil_km int,
  last_engine_oil_date date,
  last_gearbox_oil_km int,
  last_gearbox_oil_date date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access codes — 1 baris per user; kode disimpan di DB (lihat frontend /api/access)
-- ---------------------------------------------------------------------------
create table if not exists public.user_access_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.mileage_logs enable row level security;
alter table public.reminders enable row level security;
alter table public.motorcycle_categories enable row level security;
alter table public.vehicle_oil_service enable row level security;
alter table public.user_access_codes enable row level security;

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- Vehicles
drop policy if exists "vehicles_all" on public.vehicles;
create policy "vehicles_select" on public.vehicles for select using (auth.uid() = user_id);
create policy "vehicles_insert" on public.vehicles for insert with check (auth.uid() = user_id);
create policy "vehicles_update" on public.vehicles for update using (auth.uid() = user_id);
create policy "vehicles_delete" on public.vehicles for delete using (auth.uid() = user_id);

-- Mileage logs (via vehicle ownership)
drop policy if exists "mileage_select" on public.mileage_logs;
create policy "mileage_select" on public.mileage_logs for select
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "mileage_insert" on public.mileage_logs;
create policy "mileage_insert" on public.mileage_logs for insert
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "mileage_update" on public.mileage_logs;
create policy "mileage_update" on public.mileage_logs for update
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "mileage_delete" on public.mileage_logs;
create policy "mileage_delete" on public.mileage_logs for delete
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

-- Reminders
drop policy if exists "reminders_select" on public.reminders;
create policy "reminders_select" on public.reminders for select
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "reminders_insert" on public.reminders;
create policy "reminders_insert" on public.reminders for insert
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "reminders_update" on public.reminders;
create policy "reminders_update" on public.reminders for update
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "reminders_delete" on public.reminders;
create policy "reminders_delete" on public.reminders for delete
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

-- Motorcycle categories (reference data)
drop policy if exists "motorcycle_categories_read" on public.motorcycle_categories;
create policy "motorcycle_categories_read" on public.motorcycle_categories
  for select to authenticated using (true);

-- Vehicle oil service
drop policy if exists "vehicle_oil_select" on public.vehicle_oil_service;
create policy "vehicle_oil_select" on public.vehicle_oil_service
  for select using (
    exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid())
  );

drop policy if exists "vehicle_oil_insert" on public.vehicle_oil_service;
create policy "vehicle_oil_insert" on public.vehicle_oil_service
  for insert with check (
    exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid())
  );

drop policy if exists "vehicle_oil_update" on public.vehicle_oil_service;
create policy "vehicle_oil_update" on public.vehicle_oil_service
  for update using (
    exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid())
  );

drop policy if exists "vehicle_oil_delete" on public.vehicle_oil_service;
create policy "vehicle_oil_delete" on public.vehicle_oil_service
  for delete using (
    exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid())
  );

-- user_access_codes: intentionally no policies — anon/authenticated cannot read; service_role bypasses RLS.
