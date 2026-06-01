-- Rollback migrations/004_vehicle_last_fuel_fill.sql (manual di SQL Editor bila perlu).

alter table public.vehicles drop column if exists last_fuel_fill_mileage;
alter table public.vehicles drop column if exists last_fuel_fill_at;
