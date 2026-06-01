import { supabase } from "../client";
import { mapMotorcycleCategory } from "../mappers";
import type { MotorcycleCategory } from "@/lib/types";

export async function fetchMotorcycleCategories(): Promise<MotorcycleCategory[]> {
  const { data, error } = await supabase
    .from("motorcycle_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMotorcycleCategory(row as Parameters<typeof mapMotorcycleCategory>[0]));
}
