"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchVehicleDetail } from "@/lib/supabase";
import type { MotorcycleCategory, VehicleDetail } from "@/lib/types";
import {
  engineIntervalMid,
  gearboxIntervalMid,
  oilLifePercent,
  oilRemainingKm,
} from "@/lib/oil-utils";
import { DetailSkeleton } from "@/components/LoadingSkeleton";

// ---------------------------------------------------------------------------
// Status zones — single source of truth so hero, cards, and bars share copy
// & color tokens. Thresholds aligned with `OilLifeBar` for app-wide
// consistency (≥60 aman, ≥30 waspada, <30 segera).
// ---------------------------------------------------------------------------

type Zone = "good" | "warn" | "bad";

interface ZoneStyle {
  /** Short label shown in hero/card. */
  label: string;
  /** Foreground text color (matches dark mode). */
  text: string;
  /** Solid bg for progress bar fill. */
  bar: string;
  /** Soft tint for hero background. */
  bgSoft: string;
  /** Subtle ring/border for hero. */
  ring: string;
}

const ZONE_STYLES: Record<Zone, ZoneStyle> = {
  good: {
    label: "Aman",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    bgSoft: "bg-emerald-500/10",
    ring: "ring-emerald-500/25",
  },
  warn: {
    label: "Waspada",
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    bgSoft: "bg-amber-500/10",
    ring: "ring-amber-500/30",
  },
  bad: {
    label: "Segera",
    text: "text-red-600 dark:text-red-400",
    bar: "bg-red-500",
    bgSoft: "bg-red-500/10",
    ring: "ring-red-500/30",
  },
};

function zoneFromPct(pct: number): Zone {
  if (pct >= 60) return "good";
  if (pct >= 30) return "warn";
  return "bad";
}

function formatKm(value: number): string {
  return `${Math.abs(value).toLocaleString("id-ID")} km`;
}

// ---------------------------------------------------------------------------
// Domain shape — one entry per oil "stream" (engine/gearbox) for the vehicle.
// Built once via useMemo and consumed by hero + per-oil cards.
// ---------------------------------------------------------------------------

type OilKind = "engine" | "gearbox";

interface OilStream {
  kind: OilKind;
  label: string;
  /** Midpoint interval km from DB (`engine_oil_km_min/max`). */
  intervalMid: number | null;
  /** Last recorded service km — null if no oil-change record yet. */
  lastServiceKm: number | null;
  /** 0–100 remaining life. Null when not enough data. */
  pct: number | null;
  /** Sisa km to next service (negative = overdue). Null when not enough data. */
  remainingKm: number | null;
}

function buildOilStreams(
  category: MotorcycleCategory,
  currentKm: number,
  lastEngineKm: number | null,
  lastGearboxKm: number | null,
): OilStream[] {
  const streams: OilStream[] = [];
  if (category.has_engine_oil_interval) {
    const mid = engineIntervalMid(category);
    streams.push({
      kind: "engine",
      label: "Oli mesin",
      intervalMid: mid,
      lastServiceKm: lastEngineKm,
      pct: oilLifePercent(currentKm, lastEngineKm, mid),
      remainingKm: oilRemainingKm(currentKm, lastEngineKm, mid),
    });
  }
  if (category.has_gearbox_oil_interval) {
    const mid = gearboxIntervalMid(category);
    streams.push({
      kind: "gearbox",
      label: category.slug === "matic" ? "Oli gardan" : "Oli gearbox",
      intervalMid: mid,
      lastServiceKm: lastGearboxKm,
      pct: oilLifePercent(currentKm, lastGearboxKm, mid),
      remainingKm: oilRemainingKm(currentKm, lastGearboxKm, mid),
    });
  }
  return streams;
}

/**
 * Pilih stream untuk hero — "weakest link": persen terendah dari semua oli
 * yang punya data. Ini yang paling actionable bagi user (segera ganti yang
 * paling kritis dulu). Return null jika tidak ada stream yang punya data.
 */
function pickHero(streams: OilStream[]): OilStream | null {
  const withData = streams.filter((s) => s.pct != null);
  if (withData.length === 0) return null;
  return withData.reduce((min, s) => ((s.pct as number) < (min.pct as number) ? s : min));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VehicleOilPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
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
        if (!d || d.vehicle.type === "car") {
          router.replace("/dashboard");
          return;
        }
        setDetail(d);
      } catch {
        if (!cancelled) router.replace("/dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  const category = detail?.motorcycle_category ?? null;
  const hasMileage = detail?.latest_mileage != null;
  const currentKm = detail?.latest_mileage?.mileage ?? 0;

  const streams = useMemo<OilStream[]>(() => {
    if (!category) return [];
    return buildOilStreams(
      category,
      currentKm,
      detail?.oil_service?.last_engine_oil_km ?? null,
      detail?.oil_service?.last_gearbox_oil_km ?? null,
    );
  }, [category, currentKm, detail?.oil_service]);

  const hero = useMemo(() => pickHero(streams), [streams]);

  if (authLoading || !user) return null;

  const vehicleId = id as string;

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <main className="flex-1 px-5 pb-10 pt-5">
        <button
          type="button"
          onClick={() => router.push(`/vehicles/${vehicleId}`)}
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-(--color-text-secondary) transition-colors duration-200 hover:text-(--color-text)"
        >
          ← Back
        </button>

        {loading || !detail ? (
          <DetailSkeleton />
        ) : (
          <>
            {/* Header — vehicle context, title only. Long-form description
                removed per spec ("Kurangi Teks"). */}
            <header className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-(--color-primary)">
                {detail.vehicle.name}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-(--color-text)">
                Kondisi oli
              </h1>
            </header>

            {/* Compact jenis-motor pill (or warning if not set) */}
            {category ? (
              <CategoryPill category={category} />
            ) : (
              <CategoryWarning vehicleId={vehicleId} />
            )}

            {/* 2-tak side-oil note — surfaced compactly because it's a
                safety-relevant piece of info that older 2-tak engines
                require but isn't covered by the interval bars. */}
            {category?.slug === "two_stroke" && category.side_oil_note && (
              <div className="mb-5 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-500/30 dark:text-amber-200/90">
                <span className="font-bold">Oli samping:</span> {category.side_oil_note}
              </div>
            )}

            {/* HERO — single big metric the user can read in <3 detik. */}
            {category && (
              <HeroStatus
                hero={hero}
                hasMileage={hasMileage}
                currentKm={hasMileage ? currentKm : null}
                vehicleId={vehicleId}
              />
            )}

            {/* Per-oil detail cards — only render for oils the category
                actually defines. Each card is self-contained: handles its
                own empty state when this particular oil has no history. */}
            {streams.map((stream, idx) => (
              <OilCard
                key={stream.kind}
                stream={stream}
                vehicleId={vehicleId}
                className={idx === 0 ? "mt-5" : "mt-3"}
              />
            ))}

            {/* Secondary CTAs — kondisi part + riwayat. */}
            <Link
              href={`/vehicles/${vehicleId}/condition`}
              className="mt-6 flex items-center justify-between rounded-2xl bg-(--color-surface) px-5 py-4 text-sm font-semibold text-(--color-text) shadow-sm ring-1 ring-(--color-border)/60 transition-all duration-200 hover:shadow-md active:scale-[0.98]"
            >
              <span className="flex flex-col gap-0.5">
                <span>Cek kondisi part</span>
                <span className="text-[11px] font-normal text-(--color-text-secondary)">
                  Umur busi, filter, belt, dan komponen lain
                </span>
              </span>
              <span className="text-(--color-text-muted)" aria-hidden>
                →
              </span>
            </Link>

            <Link
              href={`/vehicles/${vehicleId}/service-history`}
              className="mt-3 flex items-center justify-between rounded-2xl bg-(--color-surface) px-5 py-4 text-sm font-semibold text-(--color-text) shadow-sm ring-1 ring-(--color-border)/60 transition-all duration-200 hover:shadow-md active:scale-[0.98]"
            >
              <span>Riwayat servis</span>
              <span className="text-(--color-text-muted)" aria-hidden>
                →
              </span>
            </Link>

            {/* Tertiary CTA — bengkel (text-only, lowest visual weight). */}
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/workshops?brand=${encodeURIComponent(detail.vehicle.brand)}&slug=${encodeURIComponent(category?.slug ?? "")}`,
                )
              }
              className="mt-3 w-full rounded-2xl px-5 py-3 text-xs font-semibold text-(--color-text-secondary) transition-colors duration-200 hover:text-(--color-text)"
            >
              Cari bengkel resmi terdekat →
            </button>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryPill({ category }: { category: MotorcycleCategory }) {
  const engineMid = engineIntervalMid(category);
  const gearboxMid = gearboxIntervalMid(category);
  const gearboxLabel = category.slug === "matic" ? "Gardan" : "Gearbox";

  return (
    <div className="mb-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-(--color-surface) px-3.5 py-2 text-xs font-medium text-(--color-text-secondary) shadow-sm ring-1 ring-(--color-border)/50">
      <span className="font-bold text-(--color-text)">{category.name_display}</span>
      {category.has_engine_oil_interval && engineMid != null && (
        <>
          <span aria-hidden className="text-(--color-text-muted)">•</span>
          <span>
            Mesin <span className="tabular-nums">{engineMid.toLocaleString("id-ID")}</span> km
          </span>
        </>
      )}
      {category.has_gearbox_oil_interval && gearboxMid != null && (
        <>
          <span aria-hidden className="text-(--color-text-muted)">•</span>
          <span>
            {gearboxLabel} <span className="tabular-nums">{gearboxMid.toLocaleString("id-ID")}</span> km
          </span>
        </>
      )}
    </div>
  );
}

function CategoryWarning({ vehicleId }: { vehicleId: string }) {
  return (
    <div className="mb-5 rounded-2xl bg-amber-500/10 p-4 ring-1 ring-amber-500/30">
      <p className="text-sm font-bold text-amber-950 dark:text-amber-100/95">
        Jenis motor belum diatur
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-950/85 dark:text-amber-100/80">
        Lengkapi jenis motor di detail kendaraan agar interval oli dapat dihitung.
      </p>
      <Link
        href={`/vehicles/${vehicleId}`}
        className="mt-3 inline-flex text-xs font-bold text-(--color-primary) underline-offset-2 transition-colors duration-200 hover:underline"
      >
        Buka detail kendaraan →
      </Link>
    </div>
  );
}

function HeroStatus({
  hero,
  hasMileage,
  currentKm,
  vehicleId,
}: {
  hero: OilStream | null;
  hasMileage: boolean;
  currentKm: number | null;
  vehicleId: string;
}) {
  // No mileage entered yet → user must update KM before any % makes sense.
  if (!hasMileage) {
    return (
      <HeroEmpty
        primary="Belum ada data KM"
        secondary="Tambahkan pembaruan kilometer dulu agar estimasi bisa berjalan."
        ctaHref={`/vehicles/${vehicleId}/mileage`}
        ctaLabel="+ Update KM"
      />
    );
  }

  // KM ada tapi belum pernah catat ganti oli.
  if (hero == null) {
    return (
      <HeroEmpty
        primary="Belum ada riwayat ganti oli"
        secondary="Catat ganti oli pertama untuk mulai estimasi otomatis."
        ctaHref={`/vehicles/${vehicleId}/service-history`}
        ctaLabel="+ Catat ganti oli"
      />
    );
  }

  const pct = hero.pct as number;
  const zone = zoneFromPct(pct);
  const z = ZONE_STYLES[zone];

  return (
    <section
      className={`mb-1 rounded-3xl p-6 text-center shadow-sm ring-1 transition-all duration-200 ${z.bgSoft} ${z.ring}`}
      aria-label={`Status ${hero.label}: ${z.label}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-(--color-text-muted)">
        {hero.label}
      </p>
      <p className={`mt-1 text-6xl font-black leading-none tracking-tight tabular-nums ${z.text}`}>
        {pct}
        <span className="text-3xl">%</span>
      </p>
      <p className={`mt-3 text-base font-bold ${z.text}`}>{z.label}</p>
      {hero.remainingKm != null && (
        <p className="mt-1 text-sm text-(--color-text-secondary)">
          {hero.remainingKm > 0
            ? `Sisa ±${formatKm(hero.remainingKm)}`
            : `Lewat ±${formatKm(hero.remainingKm)}`}
        </p>
      )}
      {currentKm != null && (
        <p className="mt-3 text-[11px] text-(--color-text-muted)">
          Odometer <span className="tabular-nums">{currentKm.toLocaleString("id-ID")}</span> km
        </p>
      )}
    </section>
  );
}

function HeroEmpty({
  primary,
  secondary,
  ctaHref,
  ctaLabel,
}: {
  primary: string;
  secondary: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <section className="mb-1 rounded-3xl bg-(--color-surface) p-6 text-center shadow-sm ring-1 ring-(--color-border)/50">
      <p className="text-sm font-semibold text-(--color-text)">{primary}</p>
      <p className="mt-1 text-xs leading-relaxed text-(--color-text-muted)">{secondary}</p>
      <Link
        href={ctaHref}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-(--color-primary-soft) px-4 py-2 text-xs font-bold text-(--color-primary) transition-all duration-200 hover:shadow-md active:scale-95"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}

function OilCard({
  stream,
  vehicleId,
  className,
}: {
  stream: OilStream;
  vehicleId: string;
  className?: string;
}) {
  const intervalLabel =
    stream.intervalMid != null
      ? `Interval: ${stream.intervalMid.toLocaleString("id-ID")} km`
      : null;

  // No history yet — render a slim empty state inside the card so the user
  // can record the first service without leaving the page hierarchy.
  if (stream.pct == null) {
    return (
      <div
        className={`rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/50 transition-all duration-200 hover:shadow-md ${className ?? ""}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-(--color-text)">{stream.label}</p>
          <span className="text-xs text-(--color-text-muted)">—</span>
        </div>
        {intervalLabel && (
          <p className="mt-0.5 text-xs text-(--color-text-muted)">{intervalLabel}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-(--color-bg) px-3 py-2.5">
          <span className="text-xs text-(--color-text-secondary)">
            Belum ada riwayat ganti oli
          </span>
          <Link
            href={`/vehicles/${vehicleId}/service-history`}
            className="shrink-0 rounded-full bg-(--color-primary-soft) px-3 py-1 text-[11px] font-bold text-(--color-primary) transition-all duration-200 hover:shadow-md active:scale-95"
          >
            + Catat
          </Link>
        </div>
      </div>
    );
  }

  const pct = stream.pct;
  const zone = zoneFromPct(pct);
  const z = ZONE_STYLES[zone];

  return (
    <div
      className={`rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/50 transition-all duration-200 hover:shadow-md ${className ?? ""}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-(--color-text)">{stream.label}</p>
          {intervalLabel && (
            <p className="mt-0.5 text-xs text-(--color-text-muted)">{intervalLabel}</p>
          )}
        </div>
        <p className={`text-2xl font-black tabular-nums ${z.text}`}>{pct}%</p>
      </div>

      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-(--color-border)/35"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sisa interval ${stream.label}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${z.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-(--color-text-muted)">
        <span>Perlu ganti</span>
        <span>Baru ganti</span>
      </div>

      {stream.remainingKm != null && (
        <p className="mt-2 text-xs text-(--color-text-secondary)">
          {stream.remainingKm > 0 ? "Sisa " : "Lewat "}
          <span className="font-semibold text-(--color-text)">
            {formatKm(stream.remainingKm)}
          </span>
          {stream.remainingKm <= 0 && " dari interval"}
        </p>
      )}
    </div>
  );
}
