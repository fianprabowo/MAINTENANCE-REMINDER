-- =============================================================================
-- Service receipt (nota) storage — additive migration.
--
-- Run once in Supabase SQL Editor after 001_initial_schema.sql.
-- Creates:
--   * public.service_records.receipt_path  — storage object path (nullable)
--   * private bucket `service-receipts`
--   * RLS on storage.objects: folder[1] must equal auth.uid()
--
-- Object path convention (enforced by app + policies):
--   {user_id}/{vehicle_id}/{record_id}/nota.{ext}
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Column on service_records
-- ---------------------------------------------------------------------------
alter table public.service_records
  add column if not exists receipt_path text;

comment on column public.service_records.receipt_path is
  'Path object di bucket service-receipts (bukan public URL). Null = tidak ada nota.';

-- ---------------------------------------------------------------------------
-- Bucket (private). file_size_limit 8 MiB — selaras client MAX_BYTES.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-receipts',
  'service-receipts',
  false,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage RLS — owner = first path segment (user uuid)
-- ---------------------------------------------------------------------------
drop policy if exists "service_receipts_select_own" on storage.objects;
create policy "service_receipts_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'service-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "service_receipts_insert_own" on storage.objects;
create policy "service_receipts_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'service-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "service_receipts_update_own" on storage.objects;
create policy "service_receipts_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'service-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'service-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "service_receipts_delete_own" on storage.objects;
create policy "service_receipts_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'service-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
