/**
 * Estimasi bahan bakar untuk motor matic (tangki & konsumsi referensi).
 * Hasil perkiraan; pemakaian riil bisa berbeda karena kondisi jalan, beban, angin, dsb.
 */

export type MotorSizeClass = "small" | "mid" | "big";

export type MotorFuelInput = {
  motor_type: MotorSizeClass;
  /** Jarak tempuh sejak isi penuh / estimasi terakhir (km). */
  distance_travelled: number;
  /** Efisiensi: km per liter. */
  fuel_efficiency: number;
};

export type MotorFuelResult = {
  tank_capacity: number;
  fuel_used: number;
  remaining_fuel: number;
  fuel_percentage: number;
};

/** Kapasitas tangki rata-rata (liter) sesuai aturan prompt. */
export const TANK_CAPACITY_AVG_L: Record<MotorSizeClass, number> = {
  small: 4.25,
  mid: 5.25,
  big: 6.5,
};

/** Rentang kapasitas asli (liter) — untuk copy UI / dokumentasi. */
export const TANK_CAPACITY_RANGE_L: Record<MotorSizeClass, { min: number; max: number }> = {
  small: { min: 4, max: 4.5 },
  mid: { min: 5, max: 5.5 },
  big: { min: 6, max: 7 },
};

/** Rekomendasi km/liter (referensi). */
export const FUEL_EFFICIENCY_KM_L_RANGE: Record<MotorSizeClass, { min: number; max: number }> = {
  small: { min: 40, max: 60 },
  mid: { min: 35, max: 50 },
  big: { min: 30, max: 45 },
};

export function defaultFuelEfficiencyKmL(motorType: MotorSizeClass): number {
  const r = FUEL_EFFICIENCY_KM_L_RANGE[motorType];
  return Math.round(((r.min + r.max) / 2) * 10) / 10;
}

export function calculateMotorFuel(input: MotorFuelInput): MotorFuelResult {
  const tank = TANK_CAPACITY_AVG_L[input.motor_type];
  if (input.fuel_efficiency <= 0) {
    throw new Error("Efisiensi harus lebih dari 0 km/l");
  }
  if (input.distance_travelled < 0) {
    throw new Error("Jarak tidak boleh negatif");
  }

  const fuel_used = input.distance_travelled / input.fuel_efficiency;
  let remaining_fuel = tank - fuel_used;
  if (remaining_fuel < 0) remaining_fuel = 0;

  const fuel_percentage = tank > 0 ? (remaining_fuel / tank) * 100 : 0;

  return {
    tank_capacity: tank,
    fuel_used,
    remaining_fuel,
    fuel_percentage,
  };
}

/** Contoh kategori untuk label UI. */
export const MOTOR_SIZE_LABELS: Record<
  MotorSizeClass,
  { title: string; examples: string; tankNote: string }
> = {
  small: {
    title: "Kecil",
    examples: "Beat, Mio, Scoopy",
    tankNote: "Tangki ±4–4,5 L (pakai rata-rata 4,25 L)",
  },
  mid: {
    title: "Menengah",
    examples: "Vario 125 / 150 / 160",
    tankNote: "Tangki ±5–5,5 L (pakai rata-rata 5,25 L)",
  },
  big: {
    title: "Besar",
    examples: "Nmax, PCX, Aerox",
    tankNote: "Tangki ±6–7 L (pakai rata-rata 6,5 L)",
  },
};

export function inferMotorSizeFromCategorySlug(slug: string | undefined | null): MotorSizeClass {
  if (!slug) return "mid";
  if (slug === "bebek") return "small";
  if (slug === "sport") return "big";
  return "mid";
}
