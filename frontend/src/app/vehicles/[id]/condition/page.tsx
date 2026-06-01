"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  fetchServiceRecordsForVehicle,
  fetchVehicleDetail,
} from "@/lib/supabase";
import type { ServiceRecord, VehicleDetail } from "@/lib/types";
import { DetailSkeleton } from "@/components/LoadingSkeleton";
import {
  partKindsForCondition,
  type PartKind,
} from "@/lib/part-kinds";
import {
  computePartLife,
  formatRemaining,
  pickLatestChangeBySlug,
  statusLabel,
  type PartLifeResult,
  type PartLifeStatus,
} from "@/lib/part-condition-utils";
import {
  engineIntervalMid,
  gearboxIntervalMid,
  pickLatestEngineOil,
  pickLatestGearboxOil,
} from "@/lib/oil-utils";

/**
 * Halaman "Kondisi Part" — pantau umur tiap part kendaraan dalam satu lihatan.
 *
 * Sumber data lifetime:
 *   - Oli mesin & oli gardan: dari flag `changed_engine_oil` / `changed_gearbox_oil`
 *     pada `service_records`. Interval km diambil dari midpoint
 *     `motorcycle_categories.engine_oil_km_min/max` (existing pattern dari
 *     `oil-utils.ts`). Tidak ada interval bulan untuk oli (sesuai data DB).
 *   - Part lain (busi, filter udara, V-belt, dll): dari `parts` JSONB di
 *     service record yang punya `kind_slug` matching dengan slug catalog.
 *
 * Card list di-sort dari kondisi TERBURUK ke TERBAIK supaya yang paling perlu
 * perhatian muncul di atas — sesuai spec "Sekali lihat langsung tahu part mana
 * yang bermasalah".
 */

const btnPress = "transition-all duration-150 active:scale-95";

type ConditionEntry = {
  /** Identifier unik untuk key React. */
  key: string;
  /** Label besar di card. */
  label: string;
  /** Emoji icon. */
  icon: string;
  life: PartLifeResult;
  /** Untuk debugging / tooltip — misal "Interval 10.000 km / 12 bulan". */
  intervalText: string | null;
};

function intervalText(intervalKm: number | null, intervalMonths: number | null): string | null {
  const parts: string[] = [];
  if (intervalKm != null && intervalKm > 0) parts.push(`${intervalKm.toLocaleString("id-ID")} km`);
  if (intervalMonths != null && intervalMonths > 0) parts.push(`${intervalMonths} bln`);
  if (parts.length === 0) return null;
  return `Interval ${parts.join(" / ")}`;
}

/** Urutkan: yang belum ada data → terakhir; sisanya by % ASC. */
function sortByWorstFirst(entries: ConditionEntry[]): ConditionEntry[] {
  return [...entries].sort((a, b) => {
    const ap = a.life.percent;
    const bp = b.life.percent;
    if (ap == null && bp == null) return a.label.localeCompare(b.label, "id-ID");
    if (ap == null) return 1;
    if (bp == null) return -1;
    return ap - bp;
  });
}

export default function PartConditionPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await fetchVehicleDetail(id as string);
        if (cancelled) return;
        if (!d) {
          router.replace("/dashboard");
          return;
        }
        setDetail(d);
        try {
          const list = await fetchServiceRecordsForVehicle(id as string);
          if (!cancelled) setRecords(list);
        } catch {
          if (!cancelled) setRecords([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  const entries = useMemo<ConditionEntry[]>(() => {
    if (!detail) return [];
    const currentKm = detail.latest_mileage?.mileage ?? 0;
    const cat = detail.motorcycle_category ?? null;
    const out: ConditionEntry[] = [];

    if (cat?.has_engine_oil_interval) {
      const last = pickLatestEngineOil(records);
      const intervalKm = engineIntervalMid(cat);
      const life = computePartLife(
        { interval_km: intervalKm, interval_months: null },
        last?.km ?? null,
        last?.date ?? null,
        currentKm,
      );
      out.push({
        key: "engine_oil",
        label: "Oli mesin",
        icon: "🛢️",
        life,
        intervalText: intervalText(intervalKm, null),
      });
    }

    if (cat?.has_gearbox_oil_interval) {
      const last = pickLatestGearboxOil(records);
      const intervalKm = gearboxIntervalMid(cat);
      const life = computePartLife(
        { interval_km: intervalKm, interval_months: null },
        last?.km ?? null,
        last?.date ?? null,
        currentKm,
      );
      out.push({
        key: "gearbox_oil",
        label: "Oli gardan",
        icon: "⚙️",
        life,
        intervalText: intervalText(intervalKm, null),
      });
    }

    const kinds = partKindsForCondition(cat?.slug);
    for (const kind of kinds) {
      const last = pickLatestChangeBySlug(records, kind.slug);
      const life = computePartLife(
        kind,
        last?.km ?? null,
        last?.date ?? null,
        currentKm,
      );
      out.push({
        key: kind.slug,
        label: kind.display_label,
        icon: kind.icon,
        life,
        intervalText: intervalText(kind.interval_km, kind.interval_months),
      });
    }
    return sortByWorstFirst(out);
  }, [detail, records]);

  if (authLoading || !user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-4 pb-8 pt-5 sm:px-6">
        <button
          type="button"
          onClick={() => router.push(`/vehicles/${id}`)}
          className={`mb-4 rounded-lg px-1 py-0.5 text-sm font-semibold text-(--color-text-secondary) hover:bg-(--color-surface) hover:text-(--color-text) ${btnPress}`}
        >
          ← Kembali ke detail
        </button>

        {loading || !detail ? (
          <DetailSkeleton />
        ) : (
          <div className="flex flex-col gap-5">
            <header className="space-y-2">
              <span className="inline-flex max-w-full items-center rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1 text-xs font-semibold text-(--color-text-secondary)">
                {detail.vehicle.name}
              </span>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-(--color-text)">
                  Kondisi Part
                </h1>
                <p className="mt-1 text-sm text-(--color-text-secondary)">
                  Pantau umur komponen kendaraan
                </p>
              </div>
            </header>

            {entries.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="flex flex-col gap-3">
                {entries.map((e) => (
                  <li key={e.key}>
                    <PartConditionCard entry={e} />
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-[11px] leading-relaxed text-(--color-text-muted)">
              Interval mengacu pada rekomendasi umum servis motor di Indonesia.
              Bisa berbeda tergantung kondisi pakai &amp; manual pabrikan.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-(--color-border) bg-(--color-surface)/80 px-6 py-12 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-primary-soft) text-2xl text-(--color-primary)"
        aria-hidden
      >
        📋
      </div>
      <div>
        <p className="text-base font-bold text-(--color-text)">Belum ada part untuk dipantau</p>
        <p className="mt-1 text-sm text-(--color-text-secondary)">
          Kategori kendaraan tidak punya part yang ter-track.
        </p>
      </div>
    </div>
  );
}

function statusStyle(status: PartLifeStatus | null) {
  switch (status) {
    case "safe":
      return {
        bar: "bg-emerald-500",
        pill: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
        text: "text-emerald-700 dark:text-emerald-400",
        cardRing: "ring-(--color-border)/40",
      };
    case "warn":
      return {
        bar: "bg-amber-500",
        pill: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        text: "text-amber-800 dark:text-amber-300",
        cardRing: "ring-amber-500/30",
      };
    case "urgent":
      return {
        bar: "bg-red-500",
        pill: "bg-red-500/15 text-red-700 dark:text-red-400",
        text: "text-red-700 dark:text-red-400",
        cardRing: "ring-red-500/35",
      };
    default:
      return {
        bar: "bg-(--color-border)",
        pill: "bg-(--color-surface-alt) text-(--color-text-muted)",
        text: "text-(--color-text-muted)",
        cardRing: "ring-(--color-border)/40",
      };
  }
}

function PartConditionCard({ entry }: { entry: ConditionEntry }) {
  const { life } = entry;
  const style = statusStyle(life.status);
  const pct = life.percent;
  const remainingText = formatRemaining(life);
  const noData = life.last_serviced_at == null && life.last_serviced_km == null;

  return (
    <div
      className={`rounded-xl bg-(--color-surface) p-4 shadow-sm ring-1 transition-shadow hover:shadow-md ${style.cardRing}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-bg) text-xl ring-1 ring-(--color-border)/40"
          aria-hidden
        >
          {entry.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-(--color-text)">{entry.label}</p>
              {entry.intervalText && (
                <p className="mt-0.5 truncate text-[11px] text-(--color-text-muted)">
                  {entry.intervalText}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p
                className={`text-2xl font-black tabular-nums leading-none tracking-tight ${
                  pct == null ? "text-(--color-text-muted)" : "text-(--color-text)"
                }`}
              >
                {pct == null ? "—" : `${pct}%`}
              </p>
              {life.status && (
                <span
                  className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${style.pill}`}
                >
                  {statusLabel(life.status)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="relative h-2.5 overflow-hidden rounded-full bg-(--color-border)/40">
              {pct != null && (
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${style.bar}`}
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
          </div>

          <p
            className={`mt-2 text-xs font-semibold ${
              noData ? "text-(--color-text-muted)" : style.text
            }`}
          >
            {remainingText}
          </p>
        </div>
      </div>
    </div>
  );
}
