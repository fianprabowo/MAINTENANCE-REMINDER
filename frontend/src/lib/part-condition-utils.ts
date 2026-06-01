import type { ServiceRecord } from "./types";
import type { PartKind } from "./part-kinds";

/**
 * Helper untuk halaman "Kondisi Part" (`/vehicles/[id]/condition`).
 *
 * Filosofi:
 *   - Kita TIDAK menyimpan state "last changed" di tabel terpisah. Cukup
 *     iterasi `service_records` (yang sudah punya `mileage_at_service` &
 *     `serviced_at`) lalu cari record terbaru yang mengandung part dengan
 *     `kind_slug` tertentu. Pattern ini sama dengan `oil-utils.ts` untuk
 *     oli mesin/gardan.
 *   - Records DIASUMSIKAN sudah sorted DESC by serviced_at (sesuai output
 *     `fetchServiceRecordsForVehicle`). Jika input belum sorted, fungsi
 *     tetap benar tapi kurang optimal — kita sort defensively saat butuh.
 */

export type PartLifeStatus = "safe" | "warn" | "urgent";

export type PartLifeResult = {
  /**
   * Persen sisa interval (0–100, sudah di-clamp). Null = tidak bisa dihitung
   * karena belum ada data atau interval tidak terdefinisi.
   */
  percent: number | null;
  /** Sumber utama % yang dipakai (mana yang lebih kritis: km vs waktu). */
  driver: "km" | "time" | null;
  /** Sisa km hingga interval km habis. Null kalau kind tidak km-based. */
  remaining_km: number | null;
  /** Sisa hari hingga interval waktu habis. Null kalau kind tidak time-based. */
  remaining_days: number | null;
  status: PartLifeStatus | null;
  /** Tanggal terakhir part ini diganti (ISO YYYY-MM-DD). Null = belum ada data. */
  last_serviced_at: string | null;
  /** KM odometer saat part terakhir diganti. Null = belum ada data. */
  last_serviced_km: number | null;
};

/** Klasifikasi status berdasarkan persen sisa. Sesuai spec: 60/30. */
export function statusFromPercent(percent: number | null): PartLifeStatus | null {
  if (percent == null) return null;
  if (percent >= 60) return "safe";
  if (percent >= 30) return "warn";
  return "urgent";
}

function clamp01to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Cari event "ganti" terakhir untuk part_kind tertentu pada list records.
 * Free-text part (tanpa `kind_slug`) tidak dianggap match — sengaja, supaya
 * data lifetime tidak tercemar oleh nama yang tidak konsisten.
 *
 * Records diasumsikan sudah sorted DESC by serviced_at. Bila tidak, hasilnya
 * tetap benar di banyak kasus tapi kita tidak menjamin urutan saat tied.
 */
export function pickLatestChangeBySlug(
  records: ServiceRecord[],
  slug: string,
): { km: number; date: string } | null {
  // Sort defensive: prioritaskan serviced_at desc, lalu created_at desc.
  const sorted = [...records].sort((a, b) => {
    if (a.serviced_at !== b.serviced_at) return a.serviced_at < b.serviced_at ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });
  for (const r of sorted) {
    if (r.parts.some((p) => p.kind_slug === slug)) {
      return { km: r.mileage_at_service, date: r.serviced_at };
    }
  }
  return null;
}

/**
 * Hitung sisa life untuk satu part_kind.
 *
 * Kalau kind punya DUA jenis interval (mis. ban: km + bulan), kita ambil yang
 * paling kritis (persen terkecil). `remaining_km` & `remaining_days` tetap
 * dilaporkan masing-masing supaya UI bebas memilih cara presentasi.
 */
export function computePartLife(
  kind: Pick<PartKind, "interval_km" | "interval_months">,
  lastServiceKm: number | null,
  lastServiceDate: string | null,
  currentKm: number,
  /** Tanggal "hari ini" — boleh dioverride untuk testing. */
  now: Date = new Date(),
): PartLifeResult {
  const result: PartLifeResult = {
    percent: null,
    driver: null,
    remaining_km: null,
    remaining_days: null,
    status: null,
    last_serviced_at: lastServiceDate,
    last_serviced_km: lastServiceKm,
  };

  if (lastServiceKm == null && lastServiceDate == null) {
    return result;
  }

  let pctKm: number | null = null;
  let pctTime: number | null = null;

  if (kind.interval_km != null && kind.interval_km > 0 && lastServiceKm != null) {
    const used = Math.max(0, currentKm - lastServiceKm);
    pctKm = clamp01to100(100 * (1 - used / kind.interval_km));
    result.remaining_km = kind.interval_km - used;
  }

  if (kind.interval_months != null && kind.interval_months > 0 && lastServiceDate) {
    const last = new Date(lastServiceDate + "T12:00:00");
    if (!Number.isNaN(last.getTime())) {
      const totalDays = Math.round((kind.interval_months * 365.25) / 12);
      const usedMs = now.getTime() - last.getTime();
      const usedDays = Math.max(0, Math.floor(usedMs / (1000 * 60 * 60 * 24)));
      pctTime = clamp01to100(100 * (1 - usedDays / totalDays));
      result.remaining_days = totalDays - usedDays;
    }
  }

  if (pctKm == null && pctTime == null) return result;
  if (pctKm == null) {
    result.percent = pctTime;
    result.driver = "time";
  } else if (pctTime == null) {
    result.percent = pctKm;
    result.driver = "km";
  } else if (pctKm <= pctTime) {
    result.percent = pctKm;
    result.driver = "km";
  } else {
    result.percent = pctTime;
    result.driver = "time";
  }
  result.status = statusFromPercent(result.percent);
  return result;
}

/**
 * Format "sisa" untuk ditampilkan di card. Mengikuti driver % yang aktif:
 *   - km-based  → "Sisa 1.500 km" / "Sudah waktunya ganti"
 *   - time-based → "Sisa 30 hari" / "Sudah waktunya ganti"
 *
 * Kalau belum ada data (last service null), return "Belum ada data servis".
 */
export function formatRemaining(life: PartLifeResult): string {
  if (life.last_serviced_at == null && life.last_serviced_km == null) {
    return "Belum ada data servis";
  }
  if (life.driver === "km") {
    if (life.remaining_km == null) return "—";
    if (life.remaining_km <= 0) return "Sudah waktunya ganti";
    return `Sisa ${life.remaining_km.toLocaleString("id-ID")} km`;
  }
  if (life.driver === "time") {
    if (life.remaining_days == null) return "—";
    if (life.remaining_days <= 0) return "Sudah waktunya ganti";
    return `Sisa ${life.remaining_days.toLocaleString("id-ID")} hari`;
  }
  return "—";
}

export function statusLabel(status: PartLifeStatus | null): string {
  switch (status) {
    case "safe":
      return "Aman";
    case "warn":
      return "Waspada";
    case "urgent":
      return "Segera";
    default:
      return "—";
  }
}
