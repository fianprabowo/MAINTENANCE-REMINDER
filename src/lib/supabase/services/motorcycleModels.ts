import { supabase } from "../client";
import type { MotorcycleModel } from "@/lib/types";

type Row = {
  id: string;
  category_id: string;
  brand: string;
  model_name: string;
  tank_capacity_l: number | string;
  fuel_efficiency_km_l_min: number | string;
  fuel_efficiency_km_l_max: number | string;
  sort_order: number;
};

function toNumber(v: number | string | null | undefined): number {
  if (v == null) return NaN;
  return typeof v === "number" ? v : Number.parseFloat(v);
}

function mapMotorcycleModel(row: Row): MotorcycleModel {
  return {
    id: row.id,
    category_id: row.category_id,
    brand: row.brand,
    model_name: row.model_name,
    tank_capacity_l: toNumber(row.tank_capacity_l),
    fuel_efficiency_km_l_min: toNumber(row.fuel_efficiency_km_l_min),
    fuel_efficiency_km_l_max: toNumber(row.fuel_efficiency_km_l_max),
    sort_order: row.sort_order,
  };
}

/**
 * Fetch motorcycle model presets, optionally filtered by category. Sorted by
 * brand → sort_order so the dropdown renders the spec's groupings naturally.
 */
export async function fetchMotorcycleModels(categoryId?: string): Promise<MotorcycleModel[]> {
  let q = supabase
    .from("motorcycle_models")
    .select("*")
    .order("brand", { ascending: true })
    .order("sort_order", { ascending: true });
  if (categoryId) q = q.eq("category_id", categoryId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMotorcycleModel(row as Row));
}

/** Midpoint of [min, max]; convenient default for "Efisiensi" form input. */
export function defaultEfficiencyKmL(model: MotorcycleModel): number {
  const mid = (model.fuel_efficiency_km_l_min + model.fuel_efficiency_km_l_max) / 2;
  return Math.round(mid * 10) / 10;
}
