import { supabase } from "../client";
import { mapServiceRecord } from "../mappers";
import { requireUser } from "../auth-helpers";
import type { ServicePartLine, ServiceRecord } from "@/lib/types";

async function assertVehicleOwned(vehicleId: string): Promise<void> {
  const user = await requireUser();
  const { data: v } = await supabase.from("vehicles").select("user_id").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Kendaraan tidak ditemukan");
}

export type ServiceRecordWriteInput = {
  service_type: "light" | "heavy";
  description?: string;
  location?: string;
  /**
   * Penanda eksplisit ganti oli pada kunjungan ini. Default keduanya `false`.
   * Karena oli mesin & gardan bisa diganti bersamaan, dua flag terpisah.
   */
  changed_engine_oil?: boolean;
  changed_gearbox_oil?: boolean;
  mileage_at_service: number;
  serviced_at: string;
  parts: ServicePartLine[];
};

export async function fetchServiceRecordsForVehicle(vehicleId: string): Promise<ServiceRecord[]> {
  await assertVehicleOwned(vehicleId);

  const { data, error } = await supabase
    .from("service_records")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("serviced_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapServiceRecord(row as Parameters<typeof mapServiceRecord>[0]));
}

/**
 * Lokasi unik dari riwayat servis milik user (lintas kendaraan, mengandalkan RLS untuk filter).
 * Dipakai untuk autocomplete pada form Tambah/Ubah servis.
 */
export async function fetchKnownServiceLocations(): Promise<string[]> {
  await requireUser();

  const { data, error } = await supabase
    .from("service_records")
    .select("location")
    .not("location", "is", null);

  if (error) throw new Error(error.message);

  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ location: string | null }>) {
    const loc = row.location?.trim();
    if (loc) set.add(loc);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "id-ID"));
}

export async function insertServiceRecord(vehicleId: string, input: ServiceRecordWriteInput): Promise<ServiceRecord> {
  await assertVehicleOwned(vehicleId);

  const { data, error } = await supabase
    .from("service_records")
    .insert({
      vehicle_id: vehicleId,
      service_type: input.service_type,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      changed_engine_oil: input.changed_engine_oil === true,
      changed_gearbox_oil: input.changed_gearbox_oil === true,
      mileage_at_service: input.mileage_at_service,
      serviced_at: input.serviced_at,
      parts: input.parts,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapServiceRecord(data as Parameters<typeof mapServiceRecord>[0]);
}

/**
 * Hapus satu record servis. Filter ganda (id + vehicle_id) sebagai
 * defense-in-depth — RLS sudah handle, tapi kita explicit untuk jaga-jaga
 * kalau ada parameter mix-up di sisi caller. Idempotent: kalau row tidak
 * ada (sudah dihapus user lain / race condition), tidak throw — Supabase
 * delete tidak menganggap "0 rows affected" sebagai error.
 */
export async function deleteServiceRecord(vehicleId: string, recordId: string): Promise<void> {
  await assertVehicleOwned(vehicleId);

  const { error } = await supabase
    .from("service_records")
    .delete()
    .eq("id", recordId)
    .eq("vehicle_id", vehicleId);

  if (error) throw new Error(error.message);
}

export async function updateServiceRecord(
  vehicleId: string,
  recordId: string,
  input: ServiceRecordWriteInput,
): Promise<ServiceRecord> {
  await assertVehicleOwned(vehicleId);

  const { data, error } = await supabase
    .from("service_records")
    .update({
      service_type: input.service_type,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      changed_engine_oil: input.changed_engine_oil === true,
      changed_gearbox_oil: input.changed_gearbox_oil === true,
      mileage_at_service: input.mileage_at_service,
      serviced_at: input.serviced_at,
      parts: input.parts,
    })
    .eq("id", recordId)
    .eq("vehicle_id", vehicleId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapServiceRecord(data as Parameters<typeof mapServiceRecord>[0]);
}
