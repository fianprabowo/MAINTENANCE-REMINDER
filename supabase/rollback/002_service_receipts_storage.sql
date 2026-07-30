-- Teardown for 002_service_receipts_storage.sql
-- WARNING: menghapus semua object di bucket service-receipts.

begin;

drop policy if exists "service_receipts_select_own" on storage.objects;
drop policy if exists "service_receipts_insert_own" on storage.objects;
drop policy if exists "service_receipts_update_own" on storage.objects;
drop policy if exists "service_receipts_delete_own" on storage.objects;

delete from storage.objects where bucket_id = 'service-receipts';
delete from storage.buckets where id = 'service-receipts';

alter table public.service_records
  drop column if exists receipt_path;

commit;
