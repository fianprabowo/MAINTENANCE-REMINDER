import { supabase } from "../client";
import { mapVehicleOilService } from "../mappers";
import { requireUser } from "../auth-helpers";
import type { VehicleOilService } from "@/lib/types";

export async function fetchOilServiceForVehicle(vehicleId: string): Promise<VehicleOilService | null> {
  const user = await requireUser();

  const { data: v } = await supabase.from("vehicles").select("id, user_id").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) return null;

  const { data, error } = await supabase
    .from("vehicle_oil_service")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapVehicleOilService(data as Parameters<typeof mapVehicleOilService>[0]);
}

export async function upsertVehicleOilService(
  vehicleId: string,
  patch: {
    last_engine_oil_km?: number | null;
    last_engine_oil_date?: string | null;
    last_gearbox_oil_km?: number | null;
    last_gearbox_oil_date?: string | null;
  },
): Promise<VehicleOilService> {
  const user = await requireUser();

  const { data: v } = await supabase.from("vehicles").select("id, user_id").eq("id", vehicleId).maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Vehicle not found");

  const { data: existing } = await supabase
    .from("vehicle_oil_service")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  const merged = {
    vehicle_id: vehicleId,
    last_engine_oil_km:
      patch.last_engine_oil_km !== undefined
        ? patch.last_engine_oil_km
        : (existing?.last_engine_oil_km ?? null),
    last_engine_oil_date:
      patch.last_engine_oil_date !== undefined
        ? patch.last_engine_oil_date
        : (existing?.last_engine_oil_date ?? null),
    last_gearbox_oil_km:
      patch.last_gearbox_oil_km !== undefined
        ? patch.last_gearbox_oil_km
        : (existing?.last_gearbox_oil_km ?? null),
    last_gearbox_oil_date:
      patch.last_gearbox_oil_date !== undefined
        ? patch.last_gearbox_oil_date
        : (existing?.last_gearbox_oil_date ?? null),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("vehicle_oil_service")
    .upsert(merged, { onConflict: "vehicle_id" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapVehicleOilService(data as Parameters<typeof mapVehicleOilService>[0]);
}
