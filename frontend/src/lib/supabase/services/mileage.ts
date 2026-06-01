import { supabase } from "../client";
import { mapMileage } from "../mappers";
import type { MileageLog } from "@/lib/types";

/**
 * Fetch mileage logs ordered newest-first, with optional cursor-based
 * pagination.
 *
 * Why cursor (`before`) instead of offset/range:
 *   Mileage logs receive new rows at the TOP (newest created_at). If a
 *   user is browsing page 2 (offset 10) and somebody — including
 *   themselves via AddMileageModal — inserts a new row, offset 10 now
 *   points to a row that was at offset 9 a moment ago, causing a
 *   duplicate in the merged list. Cursor based on `created_at` is
 *   stable: "give me the next N rows older than X" never overlaps
 *   regardless of inserts.
 *
 * Backward-compat: keep default `limit=50` so callers that rely on the
 * old behaviour (dashboard chart, post-update refresh) keep working.
 * Pagination consumers explicitly opt-in by passing `limit=10` etc.
 */
export interface MileageHistoryOptions {
  /** Page size. Default 50 to preserve legacy callers. */
  limit?: number;
  /** ISO timestamp; only return rows with `created_at < before`. */
  before?: string;
}

export async function fetchMileageHistory(
  vehicleId: string,
  options: MileageHistoryOptions = {},
): Promise<MileageLog[]> {
  const { limit = 50, before } = options;

  let query = supabase
    .from("mileage_logs")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMileage(row as Parameters<typeof mapMileage>[0]));
}

/** Latest odometer reading for overdue calculations; `0` if none. */
export async function getLatestMileageKm(vehicleId: string): Promise<number> {
  const { data: logs } = await supabase
    .from("mileage_logs")
    .select("mileage")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false })
    .limit(1);
  return logs?.[0]?.mileage ?? 0;
}

export async function insertMileage(vehicleId: string, mileage: number): Promise<MileageLog> {
  const { data, error } = await supabase
    .from("mileage_logs")
    .insert({ vehicle_id: vehicleId, mileage })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapMileage(data as Parameters<typeof mapMileage>[0]);
}

/**
 * Delete a single mileage log row.
 *
 * Behavior to be aware of:
 *  - The DB trigger `sync_vehicle_current_mileage` recomputes
 *    `vehicles.current_mileage_km` to MAX(remaining mileage_logs) after the
 *    delete. If you delete the latest entry, the vehicle's current KM
 *    drops to whatever the next-highest entry is. If you delete the LAST
 *    remaining entry, current_mileage_km becomes NULL.
 *  - Reminders depend on `current_mileage_km` so a delete may flip a
 *    reminder's status from "telat" → "aman" (or vice versa). The
 *    notification engine re-evaluates on the next app-open / data-change
 *    event, so consumers should dispatch `mr:vehicle-data-changed`.
 *  - We pass `vehicle_id` as a defense-in-depth filter (RLS already
 *    guards by vehicle ownership, but explicit narrowing prevents an
 *    accidental wrong-id from succeeding).
 */
export async function deleteMileageLog(
  logId: string,
  vehicleId: string,
): Promise<void> {
  const { error } = await supabase
    .from("mileage_logs")
    .delete()
    .eq("id", logId)
    .eq("vehicle_id", vehicleId);
  if (error) throw new Error(error.message);
}
