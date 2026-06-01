-- Rollback migrations/003_service_records.sql (manual di SQL Editor bila perlu).

drop policy if exists "service_records_delete" on public.service_records;
drop policy if exists "service_records_update" on public.service_records;
drop policy if exists "service_records_insert" on public.service_records;
drop policy if exists "service_records_select" on public.service_records;

drop table if exists public.service_records cascade;
