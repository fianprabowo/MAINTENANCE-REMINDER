-- DOWN / rollback untuk schema Maintenance Reminder (kebalikan dari migrations/001_maintenance_reminder.sql).
-- Jalankan manual di Supabase SQL Editor bila perlu menghapus seluruh objek aplikasi ini.
-- PERINGATAN: Menghapus data di tabel public berikut. Tidak menghapus akun di auth.users (Supabase Auth).

-- Trigger di auth.users (harus dihapus sebelum drop function handle_new_user)
drop trigger if exists on_auth_user_created on auth.users;

-- Tabel anak → induk (urutan FK). CASCADE menghapus trigger/policy di tabel tersebut.
drop table if exists public.user_access_codes cascade;
drop table if exists public.vehicle_oil_service cascade;
drop table if exists public.service_records cascade;
drop table if exists public.reminders cascade;
drop table if exists public.mileage_logs cascade;
drop table if exists public.vehicles cascade;
drop table if exists public.profiles cascade;
drop table if exists public.motorcycle_categories cascade;

-- Function (setelah trigger / dependensi dilepas)
drop function if exists public.handle_new_user() cascade;
drop function if exists public.enforce_mileage_monotonic() cascade;

-- Extension: hanya hapus jika tidak dipakai objek lain di project ini
-- drop extension if exists pgcrypto cascade;
