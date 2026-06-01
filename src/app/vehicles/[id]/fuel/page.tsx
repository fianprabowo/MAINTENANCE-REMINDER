"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useSelectedVehicle } from "@/lib/selected-vehicle";
import { fetchVehicleDetail, recordVehicleFuelFill } from "@/lib/supabase";
import { useMileageModal } from "@/lib/mileage-modal";
import { inferMotorSizeFromCategorySlug } from "@/lib/motor-fuel-calc";
import type { VehicleDetail } from "@/lib/types";
import FuelGauge from "@/components/FuelGauge";
import MotorFuelEstimator from "@/components/MotorFuelEstimator";
import { DetailSkeleton } from "@/components/LoadingSkeleton";
import { useAnimatedInt } from "@/lib/use-animated-int";

/** Status thresholds (sama dengan spec sebelumnya & komponen lain). */
type Zone = "good" | "warn" | "bad";
function zoneFromFuel(p: number): Zone {
  if (p >= 50) return "good";
  if (p >= 20) return "warn";
  return "bad";
}

/**
 * Tone tokens. Hanya zona/status yang diberi warna — sisa UI sengaja netral
 * (white surface + soft shadow) sesuai brief: "Fokus warna hanya pada status".
 */
const TONE: Record<
  Zone,
  { text: string; chipBg: string; chipText: string; label: string; sub: string }
> = {
  good: {
    text: "text-emerald-600 dark:text-emerald-400",
    chipBg: "bg-emerald-50 dark:bg-emerald-900/25",
    chipText: "text-emerald-700 dark:text-emerald-300",
    label: "Aman",
    sub: "Masih nyaman untuk jalan",
  },
  warn: {
    text: "text-amber-600 dark:text-amber-400",
    chipBg: "bg-amber-50 dark:bg-amber-900/25",
    chipText: "text-amber-700 dark:text-amber-300",
    label: "Waspada",
    sub: "Pertimbangkan isi ulang",
  },
  bad: {
    text: "text-red-600 dark:text-red-400",
    chipBg: "bg-red-50 dark:bg-red-900/25",
    chipText: "text-red-700 dark:text-red-300",
    label: "Segera isi",
    sub: "Bensin menipis — isi sekarang",
  },
};

const PRIMARY_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-(--color-primary) px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-(--color-primary)/30 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

const GHOST_BTN =
  "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm font-semibold text-(--color-text) transition-all duration-200 hover:bg-(--color-surface-alt) active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

export default function VehicleFuelPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { setSelectedVehicleId } = useSelectedVehicle();
  const { openMileageModal } = useMileageModal();
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  /** Quick-action busy flag — terpisah dari estimator detail busy. */
  const [fillingNow, setFillingNow] = useState(false);
  /** Collapsible "Detail & perhitungan" — closed by default agar fokus ke hero. */
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!id) return;
      if (!soft) setLoading(true);
      try {
        const d = await fetchVehicleDetail(id as string);
        if (!d) {
          router.replace("/dashboard");
          return;
        }
        setDetail(d);
      } catch {
        router.replace("/dashboard");
      } finally {
        if (!soft) setLoading(false);
      }
    },
    [id, router],
  );

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (id) setSelectedVehicleId(id as string);
  }, [id, setSelectedVehicleId]);

  useEffect(() => {
    if (!user || !id) return;
    void load();
  }, [user, id, load]);

  useEffect(() => {
    const onData = () => void load(true);
    window.addEventListener("mr:vehicle-data-changed", onData);
    return () => window.removeEventListener("mr:vehicle-data-changed", onData);
  }, [load]);

  // Derived numbers (memoized so the animated-number hook only re-tweens on
  // genuine changes, not on every render).
  const derived = useMemo(() => {
    if (!detail) return null;
    const v = detail.vehicle;
    const tank = v.tank_capacity_l;
    const eff = v.fuel_efficiency_km_l;
    const remainingLiters =
      tank != null && tank > 0 ? (v.fuel_level / 100) * tank : null;
    const rangeKm =
      remainingLiters != null && eff != null && eff > 0
        ? Math.round(remainingLiters * eff)
        : null;
    return {
      level: v.fuel_level,
      remainingLiters,
      rangeKm,
      zone: zoneFromFuel(v.fuel_level),
    };
  }, [detail]);

  const animatedRange = useAnimatedInt(derived?.rangeKm ?? 0);
  const animatedLevel = useAnimatedInt(derived?.level ?? 0);

  const handleFillNow = useCallback(async () => {
    if (!detail) return;
    const km = detail.latest_mileage?.mileage;
    if (km == null) {
      toast.error("Catat KM odometer dulu, baru bisa tandai isi penuh.");
      // Tunjukkan jalan ke user: buka mileage modal langsung.
      void openMileageModal();
      return;
    }
    setFillingNow(true);
    try {
      await recordVehicleFuelFill(detail.vehicle.id, {
        mileage_at_fill: km,
        tank_full: true,
      });
      toast.success("Tangki ditandai 100% di KM sekarang");
      window.dispatchEvent(new CustomEvent("mr:vehicle-data-changed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setFillingNow(false);
    }
  }, [detail, openMileageModal]);

  if (authLoading || (loading && !detail)) {
    return (
      <div className="min-h-screen bg-(--color-bg) px-4 pb-8 pt-5 sm:px-5">
        <div className="mx-auto w-full max-w-md">
          <div className="h-4 w-24 animate-pulse rounded bg-(--color-border)/50" />
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (!user || !detail || !derived) return null;

  const { vehicle, latest_mileage, motorcycle_category } = detail;
  const isMoto = vehicle.type === "motorcycle";
  const tone = TONE[derived.zone];
  const hasRange = derived.rangeKm != null;

  return (
    <div className="min-h-screen bg-(--color-bg) px-4 pb-12 pt-5 sm:px-5">
      <div className="mx-auto w-full max-w-md">
        {/* ── Header ───────────────────────────────────────────── */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm font-semibold text-(--color-text-secondary) transition-colors hover:text-(--color-text)"
        >
          ← Home
        </Link>

        <div className="mt-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--color-surface) text-2xl shadow-sm ring-1 ring-(--color-border)/50">
            ⛽
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight">Bensin</h1>
            <p className="mt-0.5 truncate text-sm text-(--color-text-secondary)">
              {vehicle.name}
            </p>
          </div>
        </div>

        {/* ── Hero (range besar + status + liters + gauge sekunder) ── */}
        <section
          className="mt-5 rounded-3xl border border-(--color-border)/60 bg-(--color-surface) p-5 shadow-sm transition-all duration-200 sm:p-6"
          aria-live="polite"
        >
          {/* Range — angka dominan */}
          <div className="text-center">
            {hasRange ? (
              <p className={`flex items-baseline justify-center gap-1.5 ${tone.text}`}>
                <span className="text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
                  {animatedRange.toLocaleString("id-ID")}
                </span>
                <span className="text-base font-bold tracking-tight">km</span>
              </p>
            ) : (
              <p className="text-2xl font-extrabold tracking-tight text-(--color-text)">
                Estimasi belum siap
              </p>
            )}

            {/* Status chip + remaining liters di bawah angka */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${tone.chipBg} ${tone.chipText}`}
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                {tone.label}
              </span>
              {derived.remainingLiters != null ? (
                <span className="text-xs font-semibold text-(--color-text-secondary)">
                  Sisa{" "}
                  <span className="tabular-nums text-(--color-text)">
                    {derived.remainingLiters.toFixed(1)} L
                  </span>
                </span>
              ) : (
                <span className="text-xs text-(--color-text-muted)">
                  Set efisiensi & tangki di Detail
                </span>
              )}
            </div>

            <p className="mt-1.5 text-[11px] text-(--color-text-muted)">{tone.sub}</p>
          </div>

          {/* Gauge — secondary, lebih kecil dari hero number */}
          <div className="mx-auto mt-4 max-w-[16rem]">
            <FuelGauge level={vehicle.fuel_level} />
          </div>

          {/* Persentase kecil di bawah gauge — referensi sekunder */}
          <p className="mt-1 text-center text-[11px] font-semibold text-(--color-text-muted)">
            Indikator{" "}
            <span className={`tabular-nums font-extrabold ${tone.text}`}>
              {animatedLevel}%
            </span>
          </p>
        </section>

        {/* ── Single primary CTA ──────────────────────────────── */}
        {isMoto ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => void handleFillNow()}
              disabled={fillingNow}
              className={PRIMARY_BTN}
            >
              {fillingNow ? (
                "Menyimpan…"
              ) : (
                <>
                  <FillIcon className="h-4 w-4" />
                  Isi penuh sekarang
                </>
              )}
            </button>
            {latest_mileage?.mileage == null ? (
              <p className="text-center text-[11px] text-(--color-text-muted)">
                Belum ada KM odometer — kami akan minta KM dulu.
              </p>
            ) : (
              <p className="text-center text-[11px] text-(--color-text-muted)">
                Akan disimpan di KM {latest_mileage.mileage.toLocaleString("id-ID")} dengan tangki dianggap 100%.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-(--color-border)/60 bg-(--color-surface) p-4 text-sm text-(--color-text-secondary) shadow-sm">
            Estimasi tangki, jarak sejak isi, dan catatan isi penuh tersedia untuk kendaraan tipe motor.
          </p>
        )}

        {/* ── Collapsible: Detail & perhitungan ───────────────── */}
        {isMoto && motorcycle_category ? (
          <section className="mt-4">
            <button
              type="button"
              onClick={() => setDetailOpen((v) => !v)}
              aria-expanded={detailOpen}
              aria-controls="fuel-detail-panel"
              className={`${GHOST_BTN} justify-between`}
            >
              <span className="flex items-center gap-2">
                <SlidersIcon className="h-4 w-4 text-(--color-text-secondary)" />
                Detail & perhitungan
              </span>
              <ChevronIcon
                className={`h-4 w-4 text-(--color-text-secondary) transition-transform duration-200 ${
                  detailOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/*
              Grid-rows trick: animatable height tanpa mengetahui tinggi
              konten. Konten tetap mounted (form state preserved) tapi
              `inert` saat closed agar tidak fokusable & tidak dibaca SR.
            */}
            <div
              id="fuel-detail-panel"
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                detailOpen ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                {/*
                 * `inert` ditambah lewat ref agar TS tidak rewel di React 18
                 * type defs lama. Kalau closed: pointer/keyboard tidak masuk.
                 */}
                <InertWrap inert={!detailOpen}>
                  <MotorFuelEstimator
                    key={`${vehicle.id}-${motorcycle_category.slug}`}
                    vehicleId={vehicle.id}
                    motorSizeClass={inferMotorSizeFromCategorySlug(motorcycle_category.slug)}
                    latestKm={latest_mileage?.mileage ?? null}
                    lastFuelFillMileage={vehicle.last_fuel_fill_mileage}
                    lastFuelFillAt={vehicle.last_fuel_fill_at}
                    onApplied={() => {
                      window.dispatchEvent(new CustomEvent("mr:vehicle-data-changed"));
                    }}
                    onRequestUpdateMileage={() => void openMileageModal()}
                  />
                </InertWrap>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Small UI primitives (icons + inert wrapper)
 * ──────────────────────────────────────────────────────────────── */

/**
 * `inert` adalah HTML attribute global, tapi typing di React versi lama
 * belum mengenalnya sebagai prop biasa. Wrapper ini menerapkan attribute
 * via DOM ref — type-safe dan SSR-aman.
 */
function InertWrap({
  inert,
  children,
}: {
  inert: boolean;
  children: React.ReactNode;
}) {
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      if (inert) node.setAttribute("inert", "");
      else node.removeAttribute("inert");
    },
    [inert],
  );
  return (
    <div ref={ref} aria-hidden={inert}>
      {children}
    </div>
  );
}

function FillIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 22h12" />
      <path d="M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18" />
      <path d="M14 9h2a2 2 0 0 1 2 2v6a2 2 0 0 0 4 0V9l-3-3" />
      <path d="M4 13h10" />
    </svg>
  );
}

function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
