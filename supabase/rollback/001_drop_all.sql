-- =============================================================================
-- Maintenance Reminder — full teardown.
--
-- Drops every object created by `supabase/migrations/001_initial_schema.sql`:
-- tables, indexes, triggers, functions, and RLS policies (policies vanish with
-- their parent tables on DROP CASCADE).
--
-- Selective approach: we touch ONLY app-owned objects under `public` plus the
-- single trigger we installed on `auth.users`. The schema itself, plus other
-- non-app objects in `public` (if any), are left intact.
--
-- WARNING: this destroys all maintenance-reminder data permanently. Make a
-- backup first if you need it. Run as the postgres role (Supabase SQL Editor)
-- because dropping a trigger on `auth.users` requires elevated privileges.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Triggers we installed on objects we DON'T own (auth schema)
-- ---------------------------------------------------------------------------
-- drop trigger if exists on_auth_user_created on auth.users;

-- ---------------------------------------------------------------------------
-- 2. Triggers on app tables
--    (Most of these would disappear with their parent table via CASCADE, but
--    we drop them explicitly so partial rollbacks are deterministic.)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_mileage_monotonic on public.mileage_logs;
drop trigger if exists trg_sync_vehicle_current_mileage_ins on public.mileage_logs;
drop trigger if exists trg_sync_vehicle_current_mileage_del on public.mileage_logs;
drop trigger if exists trg_system_parameter_set_updated_at on public.system_parameter;

-- ---------------------------------------------------------------------------
-- 3. Tables (reverse dependency order; CASCADE handles FK + indexes + policies)
-- ---------------------------------------------------------------------------
drop table if exists public.reminder_resets     cascade;
drop table if exists public.notifications        cascade;
drop table if exists public.service_records      cascade;
drop table if exists public.reminders            cascade;
drop table if exists public.mileage_logs         cascade;
drop table if exists public.vehicle_oil_service  cascade;
drop table if exists public.vehicles             cascade;
drop table if exists public.motorcycle_models    cascade;
drop table if exists public.motorcycle_categories cascade;
-- drop table if exists public.system_parameter     cascade;
-- drop table if exists public.user_access_codes    cascade;
-- drop table if exists public.profiles             cascade;

-- ---------------------------------------------------------------------------
-- 4. Functions (after tables, since trigger functions are referenced by
--    triggers above; with the triggers gone these are now standalone)
-- ---------------------------------------------------------------------------
-- drop function if exists public.handle_new_user();
drop function if exists public.enforce_mileage_monotonic();
drop function if exists public.sync_vehicle_current_mileage();
drop function if exists public.system_parameter_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Extensions are intentionally left alone — `pgcrypto` may be used by
--    other Supabase internals or other apps in the same project.
-- ---------------------------------------------------------------------------

commit;
