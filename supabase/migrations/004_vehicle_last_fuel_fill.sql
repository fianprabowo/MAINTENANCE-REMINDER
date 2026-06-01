-- Last full fuel fill anchor for odometer-based distance & estimator.

alter table public.vehicles
  add column if not exists last_fuel_fill_mileage int null
    check (last_fuel_fill_mileage is null or last_fuel_fill_mileage >= 0),
  add column if not exists last_fuel_fill_at timestamptz null;

comment on column public.vehicles.last_fuel_fill_mileage is 'Odometer (km) when tank was recorded full.';
comment on column public.vehicles.last_fuel_fill_at is 'When the user recorded that full fill.';
