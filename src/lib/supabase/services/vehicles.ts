import { supabase } from "../client";
import {
  enrichReminders,
  mapMileage,
  mapMotorcycleCategory,
  mapReminder,
  mapServiceRecord,
  mapVehicle,
} from "../mappers";
import { requireUser } from "../auth-helpers";
import { fetchMileageHistory } from "./mileage";
import { pickLatestEngineOil, pickLatestGearboxOil } from "@/lib/oil-utils";
import type {
  MotorcycleCategory,
  ServiceRecord,
  Vehicle,
  VehicleDetail,
  VehicleOilService,
} from "@/lib/types";

type VehicleRow = Parameters<typeof mapVehicle>[0] & {
  motorcycle_categories?: Parameters<typeof mapMotorcycleCategory>[0] | { name_display: string } | null;
};

export async function fetchVehiclesForUser(): Promise<Vehicle[]> {
  const user = await requireUser();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*, motorcycle_categories(name_display)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapVehicle(row as VehicleRow));
}

export async function fetchVehicleDetail(vehicleId: string): Promise<VehicleDetail | null> {
  const user = await requireUser();

  const { data: v, error: vErr } = await supabase
    .from("vehicles")
    .select("*, motorcycle_categories(*)")
    .eq("id", vehicleId)
    .maybeSingle();

  if (vErr) throw new Error(vErr.message);
  if (!v || v.user_id !== user.id) return null;

  const catRaw = v.motorcycle_categories as Parameters<typeof mapMotorcycleCategory>[0] | null;
  const motorcycle_category: MotorcycleCategory | null = catRaw ? mapMotorcycleCategory(catRaw) : null;

  const vehicle = mapVehicle({
    ...(v as VehicleRow),
    motorcycle_categories: catRaw ? { name_display: catRaw.name_display } : null,
  });

  /**
   * Three independent queries — fan out in parallel to cut perceived latency
   * roughly in half (was: 3 sequential round-trips).
   *
   * Single source of truth untuk "ganti oli terakhir" sekarang adalah
   * `service_records`. Limit 50 record terbaru sudah cukup untuk mendeteksi
   * event ganti oli terakhir; data DESC dan kita berhenti pada match pertama.
   */
  const [latestRes, remindersRes, servicesRes] = await Promise.all([
    supabase
      .from("mileage_logs")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("reminders").select("*").eq("vehicle_id", vehicleId),
    supabase
      .from("service_records")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("serviced_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (remindersRes.error) throw new Error(remindersRes.error.message);

  const latest_mileage = latestRes.data?.[0]
    ? mapMileage(latestRes.data[0] as Parameters<typeof mapMileage>[0])
    : undefined;

  const latestKm = latest_mileage?.mileage ?? 0;
  const reminders = enrichReminders(
    (remindersRes.data ?? []).map((row) => mapReminder(row as Parameters<typeof mapReminder>[0])),
    latestKm,
  );

  const serviceRows = servicesRes.data;

  const serviceRecords: ServiceRecord[] = (serviceRows ?? []).map((row) =>
    mapServiceRecord(row as Parameters<typeof mapServiceRecord>[0]),
  );

  const derivedEngine = pickLatestEngineOil(serviceRecords);
  const derivedGearbox = pickLatestGearboxOil(serviceRecords);

  const oil_service: VehicleOilService | null =
    derivedEngine || derivedGearbox
      ? {
          vehicle_id: vehicleId,
          last_engine_oil_km: derivedEngine?.km ?? null,
          last_engine_oil_date: derivedEngine?.date ?? null,
          last_gearbox_oil_km: derivedGearbox?.km ?? null,
          last_gearbox_oil_date: derivedGearbox?.date ?? null,
          updated_at: new Date().toISOString(),
        }
      : null;

  return {
    vehicle,
    motorcycle_category,
    oil_service,
    latest_mileage,
    reminders,
  };
}

export async function createVehicle(input: {
  name: string;
  type: "motorcycle" | "car";
  brand: string;
  year: number;
  /**
   * Tank fuel level (%) at registration. Optional — if omitted, defaults to 100.
   * NOTE: this is the initial snapshot only; subsequent reads compute it from
   * mileage + tank/efficiency, so this value mostly matters for the very first
   * render before the user logs an "isi penuh" or KM update.
   */
  fuel_level?: number;
  /** Liters; if omitted, the migration's defaults still apply (NULL → derived fallback). */
  tank_capacity_l?: number | null;
  /** km per liter; if omitted, falls back to motor-size class default at app layer. */
  fuel_efficiency_km_l?: number | null;
  notes?: string;
  motorcycle_category_id?: string | null;
}): Promise<Vehicle> {
  const user = await requireUser();

  const fuel = input.fuel_level ?? 100;

  const motorcycle_category_id =
    input.type === "motorcycle" ? input.motorcycle_category_id ?? null : null;

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    name: input.name,
    type: input.type,
    brand: input.brand,
    year: input.year,
    fuel_level: fuel,
    notes: input.notes ?? null,
    status: "good",
    motorcycle_category_id,
  };
  if (input.tank_capacity_l != null) insertPayload.tank_capacity_l = input.tank_capacity_l;
  if (input.fuel_efficiency_km_l != null) insertPayload.fuel_efficiency_km_l = input.fuel_efficiency_km_l;

  const { data, error } = await supabase
    .from("vehicles")
    .insert(insertPayload)
    .select("*, motorcycle_categories(name_display)")
    .single();

  if (error) throw new Error(error.message);
  return mapVehicle(data as VehicleRow);
}

/** Record a full tank: anchor km + time, and by default set fuel_level to 100%. */
export async function recordVehicleFuelFill(
  vehicleId: string,
  input: {
    mileage_at_fill: number;
    filled_at?: string;
    /** If false, only updates last fill fields (keeps current fuel_level). Default true. */
    tank_full?: boolean;
  },
): Promise<Vehicle> {
  const user = await requireUser();
  const km = Math.round(input.mileage_at_fill);
  if (!Number.isFinite(km) || km < 0) throw new Error("KM saat isi tidak valid");

  const { data: v } = await supabase.from("vehicles").select("id, user_id").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Kendaraan tidak ditemukan");

  const filledAt = input.filled_at ?? new Date().toISOString();
  const tankFull = input.tank_full !== false;

  const update: Record<string, unknown> = {
    last_fuel_fill_mileage: km,
    last_fuel_fill_at: filledAt,
    updated_at: new Date().toISOString(),
  };
  if (tankFull) update.fuel_level = 100;

  const { data, error } = await supabase
    .from("vehicles")
    .update(update)
    .eq("id", vehicleId)
    .select("*, motorcycle_categories(name_display)")
    .single();

  if (error) throw new Error(error.message);
  return mapVehicle(data as VehicleRow);
}

export async function updateVehicleFuelLevel(vehicleId: string, fuelLevelPercent: number): Promise<Vehicle> {
  const user = await requireUser();
  const level = Math.min(100, Math.max(0, Math.round(fuelLevelPercent)));

  const { data: v } = await supabase.from("vehicles").select("id, user_id").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Kendaraan tidak ditemukan");

  const { data, error } = await supabase
    .from("vehicles")
    .update({
      fuel_level: level,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vehicleId)
    .select("*, motorcycle_categories(name_display)")
    .single();

  if (error) throw new Error(error.message);
  return mapVehicle(data as VehicleRow);
}

/**
 * Update the vehicle's reference tank capacity / efficiency. Either field can
 * be omitted (undefined) to keep the existing value. After this runs, future
 * reads will derive `fuel_level` using the new constants.
 */
export async function updateVehicleFuelConfig(
  vehicleId: string,
  input: { tank_capacity_l?: number; fuel_efficiency_km_l?: number },
): Promise<Vehicle> {
  const user = await requireUser();

  const { data: v } = await supabase.from("vehicles").select("id, user_id").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Kendaraan tidak ditemukan");

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.tank_capacity_l != null) {
    if (!Number.isFinite(input.tank_capacity_l) || input.tank_capacity_l <= 0) {
      throw new Error("Kapasitas tangki harus > 0 L");
    }
    update.tank_capacity_l = input.tank_capacity_l;
  }
  if (input.fuel_efficiency_km_l != null) {
    if (!Number.isFinite(input.fuel_efficiency_km_l) || input.fuel_efficiency_km_l <= 0) {
      throw new Error("Efisiensi harus > 0 km/L");
    }
    update.fuel_efficiency_km_l = input.fuel_efficiency_km_l;
  }
  if (Object.keys(update).length === 1) {
    throw new Error("Tidak ada perubahan untuk disimpan");
  }

  const { data, error } = await supabase
    .from("vehicles")
    .update(update)
    .eq("id", vehicleId)
    .select("*, motorcycle_categories(name_display)")
    .single();

  if (error) throw new Error(error.message);
  return mapVehicle(data as VehicleRow);
}

export async function updateVehicleMotorcycleCategory(
  vehicleId: string,
  motorcycle_category_id: string | null,
): Promise<Vehicle> {
  const user = await requireUser();

  const { data: v } = await supabase.from("vehicles").select("id, user_id, type").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Vehicle not found");
  if (v.type !== "motorcycle") throw new Error("Only motorcycles have a category");

  const { data, error } = await supabase
    .from("vehicles")
    .update({
      motorcycle_category_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vehicleId)
    .select("*, motorcycle_categories(name_display)")
    .single();

  if (error) throw new Error(error.message);
  return mapVehicle(data as VehicleRow);
}

export async function deleteVehicle(vehicleId: string): Promise<void> {
  const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
  if (error) throw new Error(error.message);
}

/** Reload detail + history lists (used after mileage update). */
export async function refreshVehicleAndHistory(vehicleId: string): Promise<{
  detail: VehicleDetail | null;
  history: Awaited<ReturnType<typeof fetchMileageHistory>>;
}> {
  const [detail, history] = await Promise.all([
    fetchVehicleDetail(vehicleId),
    fetchMileageHistory(vehicleId),
  ]);
  return { detail, history };
}
