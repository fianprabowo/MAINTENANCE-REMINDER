-- =============================================================================
-- Maintenance Reminder — full schema (consolidated single migration).
--
-- Purpose: stand-alone setup for a FRESH Supabase project. Run once in the
-- Supabase SQL Editor (or via psql with the postgres role) right after creating
-- the project. The corresponding teardown lives in
-- `supabase/rollback/001_drop_all.sql`.
--
-- Requirements:
--   * Auth → Email provider enabled. Disable "Confirm email" for local dev if
--     you want signup → login flow without inbox roundtrip.
--   * `pgcrypto` extension (auto-installed below).
--
-- Notes:
--   * Use EXECUTE PROCEDURE (PG11–17 compatible). Don't switch to
--     EXECUTE FUNCTION unless you target PG14+ exclusively.
--   * `create table if not exists` makes the file idempotent for fresh re-runs;
--     it does NOT migrate existing schemas to new column shapes. If your DB
--     already has data and you need to evolve it, write a focused ALTER
--     migration instead of re-running this file.
-- =============================================================================

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

-- New auth user → profile row (pulls name/phone from raw_user_meta_data)
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
-- Motorcycle category reference (must exist before vehicles FK)
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

insert into public.motorcycle_categories (
  slug, name_display,
  engine_oil_km_min, engine_oil_km_max,
  gearbox_oil_km_min, gearbox_oil_km_max,
  has_engine_oil_interval, has_gearbox_oil_interval,
  side_oil_note, tips, sort_order
) values
  (
    'matic', 'Motor Matic',
    2000, 3000,
    6000, 8000,
    true, true,
    null,
    'Kurangi interval jika sering macet, jarak pendek, atau RPM tinggi. Cek buku manual pabrikan. Lebih baik ganti lebih awal daripada terlambat.',
    1
  ),
  (
    'bebek', 'Motor Bebek',
    2000, 4000,
    null, null,
    true, false,
    null,
    'Kurangi interval jika sering macet atau jarak pendek.',
    2
  ),
  (
    'sport', 'Motor Besar',
    3000, 6000,
    null, null,
    true, false,
    null,
    'Interval lebih panjang pada pemakaian touring; lebih pendek jika track / RPM tinggi.',
    3
  )
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Motorcycle model presets (per brand + model name) used by the "Tambah motor"
-- form to auto-fill tank capacity and fuel efficiency. Seeded with the most
-- common Indonesian matic models. Users can still pick "Lainnya / custom" in
-- the UI to skip the dropdown and enter values manually.
--
-- One row = one brand+model combo. `category_id` is FK to motorcycle_categories
-- so the dropdown can cascade: kategori → brand → model.
-- ---------------------------------------------------------------------------
create table if not exists public.motorcycle_models (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.motorcycle_categories (id) on delete restrict,
  brand text not null,
  model_name text not null,
  tank_capacity_l numeric(5,2) not null check (tank_capacity_l > 0),
  -- Efficiency stored as a [min, max] range. UI shows the range as a hint and
  -- uses the midpoint as the default. Either bound may equal the other if
  -- only a single reference value is known (e.g. Vario 125 ±51.7 km/L).
  fuel_efficiency_km_l_min numeric(5,2) not null check (fuel_efficiency_km_l_min > 0),
  fuel_efficiency_km_l_max numeric(5,2) not null check (fuel_efficiency_km_l_max > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (brand, model_name),
  check (fuel_efficiency_km_l_max >= fuel_efficiency_km_l_min)
);

create index if not exists idx_motorcycle_models_category on public.motorcycle_models (category_id);
create index if not exists idx_motorcycle_models_brand on public.motorcycle_models (brand);

-- Seed: 9 popular matic models (per spec). Bebek & sport intentionally not
-- seeded — users can pick the "Lainnya" option in the form and rely on the
-- category-level defaults instead.
insert into public.motorcycle_models (
  category_id, brand, model_name,
  tank_capacity_l,
  fuel_efficiency_km_l_min, fuel_efficiency_km_l_max,
  sort_order
)
select mc.id, m.brand, m.model_name, m.tank_l, m.eff_min, m.eff_max, m.sort_order
from (values
  ('Honda',  'Beat',       4.20, 55.0, 60.0, 1),
  ('Honda',  'Scoopy',     4.20, 50.0, 59.0, 2),
  ('Honda',  'Vario 125',  5.50, 51.7, 51.7, 3),
  ('Honda',  'Vario 160',  5.50, 46.9, 46.9, 4),
  ('Honda',  'PCX 160',    8.10, 40.0, 45.0, 5),
  ('Yamaha', 'Mio M3 125', 4.20, 50.0, 55.0, 6),
  ('Yamaha', 'Gear 125',   4.20, 48.0, 58.0, 7),
  ('Yamaha', 'Aerox 155',  5.50, 40.0, 49.0, 8),
  ('Yamaha', 'NMAX 155',   7.10, 35.0, 45.0, 9)
) as m(brand, model_name, tank_l, eff_min, eff_max, sort_order)
join public.motorcycle_categories mc on mc.slug = 'matic'
on conflict (brand, model_name) do nothing;

-- ---------------------------------------------------------------------------
-- Vehicles
--
-- Fuel-related columns:
--   * fuel_level         — legacy snapshot (% remaining). Kept for backward
--                          compatibility & as a fallback when the derivation
--                          inputs below are missing. Frontend now derives the
--                          displayed value at read time.
--   * last_fuel_fill_*   — anchor (km + timestamp) when user recorded a full
--                          tank; used to compute distance traveled since fill.
--   * tank_capacity_l    — tank capacity (L). Basis for derived fuel_level %.
--   * fuel_efficiency_km_l — reference km/L. Distance / efficiency = liters used.
--   * current_mileage_km — denormalized latest odometer reading. Maintained by
--                          a trigger on `mileage_logs` so derivation is O(1).
-- ---------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type text not null check (type in ('motorcycle', 'car')),
  brand text not null,
  year int not null check (year >= 1900 and year <= 2100),
  fuel_level int not null default 100 check (fuel_level >= 0 and fuel_level <= 100),
  tank_capacity_l numeric(5,2) check (tank_capacity_l is null or tank_capacity_l > 0),
  fuel_efficiency_km_l numeric(5,2) check (fuel_efficiency_km_l is null or fuel_efficiency_km_l > 0),
  current_mileage_km int check (current_mileage_km is null or current_mileage_km >= 0),
  last_fuel_fill_mileage int check (last_fuel_fill_mileage is null or last_fuel_fill_mileage >= 0),
  last_fuel_fill_at timestamptz,
  notes text,
  status text not null default 'good' check (status in ('good', 'warning', 'critical')),
  motorcycle_category_id uuid references public.motorcycle_categories (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.vehicles.tank_capacity_l is
  'Tank capacity in liters. Basis for the derived fuel_level %.';
comment on column public.vehicles.fuel_efficiency_km_l is
  'Reference fuel efficiency (km per liter).';
comment on column public.vehicles.current_mileage_km is
  'Denormalized latest odometer reading; kept in sync by trigger on mileage_logs.';
comment on column public.vehicles.last_fuel_fill_mileage is
  'Odometer (km) when tank was last recorded full.';
comment on column public.vehicles.last_fuel_fill_at is
  'When that full fill was recorded.';

create index if not exists idx_vehicles_user on public.vehicles (user_id);
create index if not exists idx_vehicles_motorcycle_category on public.vehicles (motorcycle_category_id);

-- ---------------------------------------------------------------------------
-- Mileage logs (immutable append-only odometer history)
-- ---------------------------------------------------------------------------
create table if not exists public.mileage_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  mileage int not null check (mileage >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_mileage_vehicle_created on public.mileage_logs (vehicle_id, created_at desc);

-- New KM must be strictly greater than the latest recorded value (no equal,
-- no rollback). This trigger is the single source of truth for monotonicity
-- since the app talks to Supabase directly (no application server).
create or replace function public.enforce_mileage_monotonic()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  latest_max int;
begin
  -- New row not visible yet on INSERT, so MAX reflects previous readings only.
  latest_max := (
    select coalesce(max(ml.mileage), -1)
    from public.mileage_logs ml
    where ml.vehicle_id = new.vehicle_id
  );

  if latest_max >= 0 and new.mileage <= latest_max then
    raise exception 'mileage must be strictly greater than the latest recorded value';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mileage_monotonic on public.mileage_logs;
create trigger trg_mileage_monotonic
  before insert on public.mileage_logs
  for each row execute procedure public.enforce_mileage_monotonic();

-- Keep `vehicles.current_mileage_km` in sync with `mileage_logs`.
-- INSERT bumps current_mileage_km up; DELETE recomputes from remaining rows.
-- UPDATE is intentionally not handled — mileage_logs rows are immutable in app.
create or replace function public.sync_vehicle_current_mileage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.vehicles
       set current_mileage_km = greatest(coalesce(current_mileage_km, 0), new.mileage),
           updated_at = now()
     where id = new.vehicle_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.vehicles
       set current_mileage_km = (
             select max(mileage) from public.mileage_logs where vehicle_id = old.vehicle_id
           ),
           updated_at = now()
     where id = old.vehicle_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_vehicle_current_mileage_ins on public.mileage_logs;
create trigger trg_sync_vehicle_current_mileage_ins
  after insert on public.mileage_logs
  for each row execute procedure public.sync_vehicle_current_mileage();

drop trigger if exists trg_sync_vehicle_current_mileage_del on public.mileage_logs;
create trigger trg_sync_vehicle_current_mileage_del
  after delete on public.mileage_logs
  for each row execute procedure public.sync_vehicle_current_mileage();

-- ---------------------------------------------------------------------------
-- Reminders (scheduled service jobs per vehicle)
-- ---------------------------------------------------------------------------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_type text not null check (service_type in ('light', 'heavy')),
  -- Optional categorical tag picked by the UI (Ganti oli, Servis rutin, CVT,
  -- Rem, Aki). `service_type` above is derived from this for backward-compat
  -- with older clients. Nullable so legacy rows keep working.
  preset_slug text,
  km_interval int not null default 0,
  date_interval_days int not null default 0,
  last_service_km int not null default 0,
  last_service_date date,
  next_due_km int not null default 0,
  next_due_date timestamptz,
  -- Schedule definition. When NULL, the legacy `date_interval_days` field is
  -- used as the time trigger. Per-kind shape:
  --   once    → schedule_once_at is the single trigger
  --   daily   → no extra fields (fires every day)
  --   weekly  → schedule_weekdays (0..6, 0 = Minggu)
  --   monthly → schedule_day_of_month (1..31, clamped to month length)
  schedule_kind text,
  schedule_once_at timestamptz,
  schedule_weekdays smallint[],
  schedule_day_of_month smallint,
  -- 'once' (default) flags the reminder as "Telat" once when km threshold is
  -- crossed; 'daily' keeps reminding daily until the user resolves it.
  km_alert_mode text not null default 'once',
  -- Anti-spam state for the notification engine.
  --   • last_notified_at  → newest emit timestamp (null = never)
  --   • last_notified_type → 'mendekati' | 'terlewat'
  -- Both reset to null when the reminder snapshot is reset (auto-reset
  -- after a matching service record, or manual "tandai sudah servis").
  last_notified_at timestamptz,
  last_notified_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent guards — `drop … if exists` first so the file is safe to re-run
-- and so future revisions of these enum-like lists don't leave a stale
-- check around.
alter table public.reminders
  drop constraint if exists reminders_preset_slug_check;
alter table public.reminders
  add constraint reminders_preset_slug_check
    check (
      preset_slug is null
      or preset_slug in (
        'oil_change',
        'regular_service',
        'cvt',
        'brake',
        'battery'
      )
    );

alter table public.reminders
  drop constraint if exists reminders_schedule_kind_check;
alter table public.reminders
  add constraint reminders_schedule_kind_check
    check (
      schedule_kind is null
      or schedule_kind in ('once', 'daily', 'weekly', 'monthly')
    );

alter table public.reminders
  drop constraint if exists reminders_schedule_day_of_month_check;
alter table public.reminders
  add constraint reminders_schedule_day_of_month_check
    check (
      schedule_day_of_month is null
      or (schedule_day_of_month between 1 and 31)
    );

alter table public.reminders
  drop constraint if exists reminders_schedule_weekdays_check;
alter table public.reminders
  add constraint reminders_schedule_weekdays_check
    check (
      schedule_weekdays is null
      or (
        array_length(schedule_weekdays, 1) between 1 and 7
        and schedule_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
      )
    );

alter table public.reminders
  drop constraint if exists reminders_schedule_consistency_check;
alter table public.reminders
  add constraint reminders_schedule_consistency_check
    check (
      schedule_kind is null
      or (
        schedule_kind = 'once'
        and schedule_once_at is not null
        and schedule_weekdays is null
        and schedule_day_of_month is null
      )
      or (
        schedule_kind = 'daily'
        and schedule_once_at is null
        and schedule_weekdays is null
        and schedule_day_of_month is null
      )
      or (
        schedule_kind = 'weekly'
        and schedule_once_at is null
        and schedule_weekdays is not null
        and schedule_day_of_month is null
      )
      or (
        schedule_kind = 'monthly'
        and schedule_once_at is null
        and schedule_weekdays is null
        and schedule_day_of_month is not null
      )
    );

alter table public.reminders
  drop constraint if exists reminders_km_alert_mode_check;
alter table public.reminders
  add constraint reminders_km_alert_mode_check
    check (km_alert_mode in ('once', 'daily'));

alter table public.reminders
  drop constraint if exists reminders_last_notified_type_check;
alter table public.reminders
  add constraint reminders_last_notified_type_check
    check (
      last_notified_type is null
      or last_notified_type in ('mendekati', 'terlewat')
    );

create index if not exists idx_reminders_vehicle on public.reminders (vehicle_id);
create index if not exists idx_reminders_preset_slug on public.reminders (preset_slug);
create index if not exists idx_reminders_schedule_kind on public.reminders (schedule_kind);
create index if not exists idx_reminders_last_notified_at on public.reminders (last_notified_at);

-- ---------------------------------------------------------------------------
-- Vehicle oil service (legacy single-row snapshot per vehicle).
-- Kept for backward compatibility; current frontend reads directly from
-- service_records to derive the latest oil-change event.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicle_oil_service (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  last_engine_oil_km int,
  last_engine_oil_date date,
  last_gearbox_oil_km int,
  last_gearbox_oil_date date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Service records (immutable history of past services per vehicle).
--
-- Columns:
--   * parts                 — JSONB array: [{ "name": "...", "price": 123, "kind_slug": "..." }]
--                             price is integer Rupiah. kind_slug standardizes
--                             part type for downstream "Kondisi Part" tracking.
--   * location              — free-text bengkel name (optional).
--   * changed_engine_oil    — explicit flag: this visit changed engine oil.
--   * changed_gearbox_oil   — explicit flag: this visit changed gearbox oil.
--                             (Both can be true on a single visit.)
-- ---------------------------------------------------------------------------
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_type text not null check (service_type in ('light', 'heavy')),
  description text,
  location text,
  parts jsonb not null default '[]'::jsonb,
  changed_engine_oil boolean not null default false,
  changed_gearbox_oil boolean not null default false,
  mileage_at_service int not null check (mileage_at_service >= 0),
  serviced_at date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_records_vehicle_serviced
  on public.service_records (vehicle_id, serviced_at desc, created_at desc);

create index if not exists idx_service_records_location
  on public.service_records (location)
  where location is not null;

create index if not exists idx_service_records_engine_oil
  on public.service_records (vehicle_id, serviced_at desc, created_at desc)
  where changed_engine_oil = true;

create index if not exists idx_service_records_gearbox_oil
  on public.service_records (vehicle_id, serviced_at desc, created_at desc)
  where changed_gearbox_oil = true;

-- ---------------------------------------------------------------------------
-- Notifications inbox
--
-- Append-only log surfaced by the bell icon and `/notifications` page.
-- Title/body are rendered & frozen at emit time so historical messages
-- don't drift if copywriting changes later.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  reminder_id uuid references public.reminders (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link_to text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id) where read_at is null;
create index if not exists idx_notifications_reminder
  on public.notifications (reminder_id) where reminder_id is not null;

-- ---------------------------------------------------------------------------
-- Reminder reset snapshots
--
-- Tracks pre-reset reminder state so the UI can offer one-tap "Undo" after
-- an auto-reset (typically triggered by logging a matching service record).
-- Snapshots older than ~24h are pruned by the application layer.
-- ---------------------------------------------------------------------------
create table if not exists public.reminder_resets (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  service_record_id uuid references public.service_records (id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reminder_resets_user_created
  on public.reminder_resets (user_id, created_at desc);
create index if not exists idx_reminder_resets_reminder
  on public.reminder_resets (reminder_id);

-- ---------------------------------------------------------------------------
-- User access codes (1 baris per user; consumed by /api/access route)
-- ---------------------------------------------------------------------------
create table if not exists public.user_access_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- System parameter (generic key/value flags consumed by app shell).
-- Boolean values are stored as lowercase 'true' / 'false' strings; the column
-- type stays `text` to allow other strings (URL, version, etc) later.
-- Read is public (anon + authenticated); writes only via service_role.
-- ---------------------------------------------------------------------------
create table if not exists public.system_parameter (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

create or replace function public.system_parameter_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_system_parameter_set_updated_at on public.system_parameter;
create trigger trg_system_parameter_set_updated_at
  before update on public.system_parameter
  for each row execute procedure public.system_parameter_set_updated_at();

insert into public.system_parameter (key, value, description) values
  ('login_page',  'true', 'Aktifkan halaman /login (login email + password). Kalau false, /login redirect ke /access.'),
  ('signup_page', 'true', 'Aktifkan halaman /register (signup mandiri). Kalau false, /register tidak dapat diakses.')
on conflict (key) do nothing;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles             enable row level security;
alter table public.vehicles             enable row level security;
alter table public.mileage_logs         enable row level security;
alter table public.reminders            enable row level security;
alter table public.motorcycle_categories enable row level security;
alter table public.motorcycle_models    enable row level security;
alter table public.vehicle_oil_service  enable row level security;
alter table public.service_records      enable row level security;
alter table public.user_access_codes    enable row level security;
alter table public.system_parameter     enable row level security;
alter table public.notifications        enable row level security;
alter table public.reminder_resets      enable row level security;

-- Profiles --------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- Vehicles --------------------------------------------------------------------
drop policy if exists "vehicles_all"    on public.vehicles;
drop policy if exists "vehicles_select" on public.vehicles;
drop policy if exists "vehicles_insert" on public.vehicles;
drop policy if exists "vehicles_update" on public.vehicles;
drop policy if exists "vehicles_delete" on public.vehicles;
create policy "vehicles_select" on public.vehicles for select using (auth.uid() = user_id);
create policy "vehicles_insert" on public.vehicles for insert with check (auth.uid() = user_id);
create policy "vehicles_update" on public.vehicles for update using (auth.uid() = user_id);
create policy "vehicles_delete" on public.vehicles for delete using (auth.uid() = user_id);

-- Mileage logs (via vehicle ownership) ---------------------------------------
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

-- Reminders -------------------------------------------------------------------
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

-- Notifications (scoped by user_id) -------------------------------------------
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications
  for insert with check (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id);

-- Reminder reset snapshots (scoped by user_id) --------------------------------
drop policy if exists "reminder_resets_select_own" on public.reminder_resets;
create policy "reminder_resets_select_own" on public.reminder_resets
  for select using (auth.uid() = user_id);

drop policy if exists "reminder_resets_insert_own" on public.reminder_resets;
create policy "reminder_resets_insert_own" on public.reminder_resets
  for insert with check (auth.uid() = user_id);

drop policy if exists "reminder_resets_delete_own" on public.reminder_resets;
create policy "reminder_resets_delete_own" on public.reminder_resets
  for delete using (auth.uid() = user_id);

-- Motorcycle categories (read-only reference data) ----------------------------
drop policy if exists "motorcycle_categories_read" on public.motorcycle_categories;
create policy "motorcycle_categories_read" on public.motorcycle_categories
  for select to authenticated using (true);

-- Motorcycle models (read-only reference data) ---------------------------------
drop policy if exists "motorcycle_models_read" on public.motorcycle_models;
create policy "motorcycle_models_read" on public.motorcycle_models
  for select to authenticated using (true);

-- Vehicle oil service ---------------------------------------------------------
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

-- Service records -------------------------------------------------------------
drop policy if exists "service_records_select" on public.service_records;
create policy "service_records_select" on public.service_records for select
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "service_records_insert" on public.service_records;
create policy "service_records_insert" on public.service_records for insert
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "service_records_update" on public.service_records;
create policy "service_records_update" on public.service_records for update
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

drop policy if exists "service_records_delete" on public.service_records;
create policy "service_records_delete" on public.service_records for delete
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

-- System parameter (public read; writes only via service_role) ----------------
drop policy if exists "system_parameter_select_public" on public.system_parameter;
create policy "system_parameter_select_public" on public.system_parameter
  for select using (true);

-- user_access_codes: intentionally no policies — anon/authenticated cannot read,
-- service_role bypasses RLS for admin scripts.
