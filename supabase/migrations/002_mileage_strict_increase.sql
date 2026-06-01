-- KM baru harus strictly > nilai terakhir (bukan sama).
create or replace function public.enforce_mileage_monotonic()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  latest_max int;
begin
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
