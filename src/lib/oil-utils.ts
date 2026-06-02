import type { MotorcycleCategory, ServiceRecord } from "@/lib/types";

/** Midpoint of min–max interval from reference data (KM). */
export function intervalMidKm(min: number | null, max: number | null): number | null {
  if (min == null || max == null) return null;
  if (min <= 0 && max <= 0) return null;
  return Math.round((min + max) / 2);
}

/**
 * Remaining "life" from 100% (just after service) toward 0% (at/ past interval).
 * Uses linear wear vs interval midpoint from DB.
 */
export function oilLifePercent(
  currentKm: number,
  lastServiceKm: number | null,
  intervalMid: number | null,
): number | null {
  if (intervalMid == null || intervalMid <= 0) return null;
  if (lastServiceKm == null) return null;
  const used = currentKm - lastServiceKm;
  const raw = 100 * (1 - used / intervalMid);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Sisa km hingga interval ganti oli berikutnya berdasarkan midpoint interval.
 *
 * Nilai negatif berarti odometer sudah melewati interval (overdue) — caller
 * yang memutuskan menampilkan "Lewat ±X km" atau bentuk lain. Return `null`
 * jika data tidak cukup (belum ada riwayat servis atau interval tidak
 * terdefinisi). Tidak di-clamp supaya pemanggil bisa membedakan "tepat di
 * batas" (0) vs "sangat overdue" (-2000).
 */
export function oilRemainingKm(
  currentKm: number,
  lastServiceKm: number | null,
  intervalMid: number | null,
): number | null {
  if (intervalMid == null || intervalMid <= 0) return null;
  if (lastServiceKm == null) return null;
  return intervalMid - (currentKm - lastServiceKm);
}

export function formatIntervalRange(
  min: number | null,
  max: number | null,
): string | null {
  if (min == null || max == null) return null;
  return `${min.toLocaleString()}–${max.toLocaleString()} km`;
}

export function engineIntervalMid(category: MotorcycleCategory): number | null {
  return intervalMidKm(category.engine_oil_km_min, category.engine_oil_km_max);
}

export function gearboxIntervalMid(category: MotorcycleCategory): number | null {
  return intervalMidKm(category.gearbox_oil_km_min, category.gearbox_oil_km_max);
}

/**
 * Klasifikasi service record sebagai event "ganti oli".
 *
 * Sumber kebenaran utama: dua flag boolean independen `changed_engine_oil` dan
 * `changed_gearbox_oil` (migrasi 009) — diisi dari checkbox pada form Tambah Servis.
 * Karena dua oli bisa diganti bersamaan dalam satu kunjungan, ini bukan enum.
 *
 * Bila kedua flag false (data legacy yang belum di-backfill), fallback ke deteksi
 * keyword di `description`:
 * - Service besar ("heavy") tidak otomatis dihitung sebagai ganti oli — biarkan
 *   terpisah agar interval reminder service besar tidak terkontaminasi.
 * - Match keyword "ganti oli" (case-insensitive) di `description`.
 */
export function isOilChangeRecord(r: ServiceRecord): boolean {
  if (r.changed_engine_oil || r.changed_gearbox_oil) return true;
  if (r.service_type === "heavy") return false;
  const d = (r.description ?? "").toLowerCase();
  return d.includes("ganti oli");
}

/**
 * Apakah record mencakup ganti oli gardan/gearbox/transmisi.
 * Catatan: bila record juga `changed_engine_oil = true`, fungsi `isEngineOilRecord`
 * juga akan return true untuk record yang sama — itu memang yang diinginkan.
 */
export function isGearboxOilRecord(r: ServiceRecord): boolean {
  if (r.changed_gearbox_oil) return true;
  if (r.changed_engine_oil) return false;
  if (!isOilChangeRecord(r)) return false;
  const d = (r.description ?? "").toLowerCase();
  return /\b(gardan|gearbox|transmisi)\b/.test(d);
}

/** Apakah record mencakup ganti oli mesin. */
export function isEngineOilRecord(r: ServiceRecord): boolean {
  if (r.changed_engine_oil) return true;
  if (r.changed_gearbox_oil) return false;
  return isOilChangeRecord(r) && !isGearboxOilRecord(r);
}

/**
 * Ambil event ganti oli mesin terbaru. Records diasumsikan sudah sorted DESC
 * (serviced_at desc, lalu created_at desc) seperti hasil `fetchServiceRecordsForVehicle`.
 * Return null kalau belum pernah ada record ganti oli mesin.
 */
export function pickLatestEngineOil(
  records: ServiceRecord[],
): { km: number; date: string } | null {
  let best: { km: number; date: string } | null = null;
  for (const r of records) {
    if (!isEngineOilRecord(r)) continue;
    if (
      !best ||
      r.mileage_at_service > best.km ||
      (r.mileage_at_service === best.km && r.serviced_at > best.date)
    ) {
      best = { km: r.mileage_at_service, date: r.serviced_at };
    }
  }
  return best;
}

/** Sama seperti pickLatestEngineOil tapi untuk gearbox/gardan. */
export function pickLatestGearboxOil(
  records: ServiceRecord[],
): { km: number; date: string } | null {
  let best: { km: number; date: string } | null = null;
  for (const r of records) {
    if (!isGearboxOilRecord(r)) continue;
    if (
      !best ||
      r.mileage_at_service > best.km ||
      (r.mileage_at_service === best.km && r.serviced_at > best.date)
    ) {
      best = { km: r.mileage_at_service, date: r.serviced_at };
    }
  }
  return best;
}
