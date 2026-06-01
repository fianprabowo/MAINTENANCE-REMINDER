-- Riwayat servis per kendaraan (bukan reminder / jadwal).
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_type text not null check (service_type in ('light', 'heavy')),
  description text,
  mileage_at_service int not null check (mileage_at_service >= 0),
  serviced_at date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_records_vehicle_serviced
  on public.service_records (vehicle_id, serviced_at desc, created_at desc);

alter table public.service_records enable row level security;

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
