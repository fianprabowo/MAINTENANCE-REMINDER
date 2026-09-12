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
import { Button, IconButton, SectionLabel } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Status zones — single source of truth so hero, cards, and bars share copy
// & color tokens. Thresholds aligned with `OilLifeBar` for app-wide
// consistency (≥60 aman, ≥30 waspada, <30 segera).
// ---------------------------------------------------------------------------

type Zone = "good" | "warn" | "bad";

interface ZoneStyle {
  /** Foreground text color (matches dark mode). */
  text: string;
  /** Solid bg for progress bar fill. */
  bar: string;
  /** Soft tint for hero background. */
  bgSoft: string;
  /** Subtle ring/border for hero. */
  ring: string;
}

// Zone styles — mode-aware via `--zone-*` CSS tokens (lihat globals.css):
//   • Grayscale mode: opacity tier dari --color-text (safe=40%/warn=70%/bad=100%)
//   • Color mode: green/amber/red semantic
// `bgSoft` dan `ring` sengaja tetap pakai `--color-text/N` (subtle depth
// accent yang mode-independent) supaya card tidak terlalu tinted.
const ZONE_STYLES: Record<Zone, ZoneStyle> = {
  good: {
    text: "text-(--color-text-secondary)",
    bar: "bg-(--zone-safe)",
    bgSoft: "bg-(--color-text)/5",
    ring: "ring-(--color-text)/15",
  },
  warn: {
    text: "text-(--color-text)",
    bar: "bg-(--zone-warn)",
    bgSoft: "bg-(--color-text)/8",
    ring: "ring-(--color-text)/25",
  },
  bad: {
    text: "text-(--color-text) font-bold",
    bar: "bg-(--zone-alarm)",
    bgSoft: "bg-(--color-text)/12",
    ring: "ring-(--color-text)/40",
  },
};

function zoneFromPct(pct: number): Zone {
  if (pct >= 60) return "good";
  if (pct >= 30) return "warn";
  return "bad";
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
      label: "engine",
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
      label: category.slug === "matic" ? "gear" : "gearbox",
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
  const { t, formatNumber } = useTranslation();

  const streamLabel = (label: string) => {
    if (label === "engine") return t("oilPage.engineOil");
    if (label === "gear") return t("oilPage.gearOil");
    return t("oilPage.gearboxOil");
  };

  const zoneLabel = (zone: Zone) =>
    ({
      good: t("oilPage.zoneGood"),
      warn: t("oilPage.zoneWarn"),
      bad: t("oilPage.zoneBad"),
    })[zone];

  const formatKm = (value: number) => `${formatNumber(Math.abs(value))} km`;
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
        <IconButton
          label={t("oilPage.back")}
          variant="ghost"
          size="lg"
          onClick={() => router.push(`/vehicles/${vehicleId}`)}
          className="mb-4 -ml-2"
        >
          <BackIcon className="h-5 w-5" />
        </IconButton>

        {loading || !detail ? (
          <DetailSkeleton />
        ) : (
          <>
            {/* Header — vehicle context, title only. Long-form description
                removed per spec ("Kurangi Teks"). */}
            <header className="mb-4">
              <SectionLabel className="text-(--color-primary)">
                {detail.vehicle.name}
              </SectionLabel>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-(--color-text)">
                {t("oilPage.title")}
              </h1>
            </header>

            {/* Compact jenis-motor pill (or warning if not set) */}
            {category ? (
              <CategoryPill category={category} t={t} formatNumber={formatNumber} />
            ) : (
              <CategoryWarning vehicleId={vehicleId} t={t} />
            )}

            {/* 2-tak side-oil note — surfaced compactly because it's a
                safety-relevant piece of info that older 2-tak engines
                require but isn't covered by the interval bars. */}
            {category?.slug === "two_stroke" && category.side_oil_note && (
              // Warning note (grayscale) — soft neutral bg + darker ring untuk
              // encode "attention" via visual weight, bukan hue.
              <div className="mb-5 rounded-2xl bg-(--color-surface-alt) px-4 py-3 text-xs leading-relaxed text-(--color-text) ring-1 ring-(--color-text)/20">
                <span className="font-bold">{t("oilPage.sideOil")}</span> {category.side_oil_note}
              </div>
            )}

            {/* HERO — single big metric the user can read in <3 detik. */}
            {category && (
              <HeroStatus
                hero={hero}
                hasMileage={hasMileage}
                currentKm={hasMileage ? currentKm : null}
                vehicleId={vehicleId}
                t={t}
                formatNumber={formatNumber}
                streamLabel={streamLabel}
                zoneLabel={zoneLabel}
                formatKm={formatKm}
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
                t={t}
                formatNumber={formatNumber}
                streamLabel={streamLabel}
                zoneLabel={zoneLabel}
                formatKm={formatKm}
              />
            ))}

            {/* Secondary CTAs — kondisi part + riwayat. */}
            <Link
              href={`/vehicles/${vehicleId}/condition`}
              className="mt-6 flex items-center justify-between rounded-2xl bg-(--color-surface) px-5 py-4 text-sm font-semibold text-(--color-text) shadow-sm ring-1 ring-(--color-border)/60 transition-all duration-200 hover:shadow-md active:scale-[0.98]"
            >
              <span className="flex flex-col gap-0.5">
                <span>{t("oilPage.checkParts")}</span>
                <span className="text-[11px] font-normal text-(--color-text-secondary)">
                  {t("oilPage.checkPartsSub")}
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
              <span>{t("oilPage.serviceHistory")}</span>
              <span className="text-(--color-text-muted)" aria-hidden>
                →
              </span>
            </Link>

            {/* Tertiary CTA — bengkel (text-only, lowest visual weight). */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() =>
                router.push(
                  `/workshops?brand=${encodeURIComponent(detail.vehicle.brand)}&slug=${encodeURIComponent(category?.slug ?? "")}`,
                )
              }
              className="mt-3"
            >
              {t("oilPage.findWorkshop")}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryPill({
  category,
  t,
  formatNumber,
}: {
  category: MotorcycleCategory;
  t: ReturnType<typeof useTranslation>["t"];
  formatNumber: ReturnType<typeof useTranslation>["formatNumber"];
}) {
  const engineMid = engineIntervalMid(category);
  const gearboxMid = gearboxIntervalMid(category);
  const gearboxLabel =
    category.slug === "matic" ? t("oilPage.categoryGearbox") : t("oilPage.categoryGear");

  return (
    <div className="mb-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-(--color-surface) px-3.5 py-2 text-xs font-medium text-(--color-text-secondary) shadow-sm ring-1 ring-(--color-border)/50">
      <span className="font-bold text-(--color-text)">{category.name_display}</span>
      {category.has_engine_oil_interval && engineMid != null && (
        <>
          <span aria-hidden className="text-(--color-text-muted)">•</span>
          <span>
            {t("oilPage.categoryEngine")}{" "}
            <span className="tabular-nums">{formatNumber(engineMid)}</span> km
          </span>
        </>
      )}
      {category.has_gearbox_oil_interval && gearboxMid != null && (
        <>
          <span aria-hidden className="text-(--color-text-muted)">•</span>
          <span>
            {gearboxLabel} <span className="tabular-nums">{formatNumber(gearboxMid)}</span> km
          </span>
        </>
      )}
    </div>
  );
}

function CategoryWarning({
  vehicleId,
  t,
}: {
  vehicleId: string;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    // Grayscale warning callout — sebelumnya amber/10. Sekarang neutral bg
    // dengan ring lebih tegas untuk "attention".
    <div className="mb-5 rounded-2xl bg-(--color-surface-alt) p-4 ring-1 ring-(--color-text)/25">
      <p className="text-sm font-bold text-(--color-text)">
        {t("oilPage.categoryNotSetTitle")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-(--color-text-secondary)">
        {t("oilPage.categoryNotSetSub")}
      </p>
      <Link
        href={`/vehicles/${vehicleId}`}
        className="mt-3 inline-flex text-xs font-bold text-(--color-primary) underline-offset-2 transition-colors duration-200 hover:underline"
      >
        {t("oilPage.categoryNotSetCta")}
      </Link>
    </div>
  );
}

function HeroStatus({
  hero,
  hasMileage,
  currentKm,
  vehicleId,
  t,
  formatNumber,
  streamLabel,
  zoneLabel,
  formatKm,
}: {
  hero: OilStream | null;
  hasMileage: boolean;
  currentKm: number | null;
  vehicleId: string;
  t: ReturnType<typeof useTranslation>["t"];
  formatNumber: ReturnType<typeof useTranslation>["formatNumber"];
  streamLabel: (label: string) => string;
  zoneLabel: (zone: Zone) => string;
  formatKm: (value: number) => string;
}) {
  // No mileage entered yet → user must update KM before any % makes sense.
  if (!hasMileage) {
    return (
      <HeroEmpty
        primary={t("oilPage.noKmTitle")}
        secondary={t("oilPage.noKmSub")}
        ctaHref={`/vehicles/${vehicleId}/mileage`}
        ctaLabel={t("oilPage.noKmCta")}
      />
    );
  }

  // KM ada tapi belum pernah catat ganti oli.
  if (hero == null) {
    return (
      <HeroEmpty
        primary={t("oilPage.noHistoryTitle")}
        secondary={t("oilPage.noHistorySub")}
        ctaHref={`/vehicles/${vehicleId}/service-history`}
        ctaLabel={t("oilPage.noHistoryCta")}
      />
    );
  }

  const pct = hero.pct as number;
  const zone = zoneFromPct(pct);
  const z = ZONE_STYLES[zone];
  const label = streamLabel(hero.label);

  return (
    <section
      className={`mb-1 rounded-3xl p-6 text-center shadow-sm ring-1 transition-all duration-200 ${z.bgSoft} ${z.ring}`}
      aria-label={t("oilPage.statusAria", { label, zone: zoneLabel(zone) })}
    >
      <SectionLabel>{label}</SectionLabel>
      <p className={`mt-1 text-6xl font-black leading-none tracking-tight tabular-nums ${z.text}`}>
        {pct}
        <span className="text-3xl">%</span>
      </p>
      <p className={`mt-3 text-base font-bold ${z.text}`}>{zoneLabel(zone)}</p>
      {hero.remainingKm != null && (
        <p className="mt-1 text-sm text-(--color-text-secondary)">
          {hero.remainingKm > 0
            ? t("oilPage.remaining", { km: formatKm(hero.remainingKm) })
            : t("oilPage.overdue", { km: formatKm(hero.remainingKm) })}
        </p>
      )}
      {currentKm != null && (
        <p className="mt-3 text-[11px] text-(--color-text-muted)">
          {t("oilPage.odometer", { km: formatNumber(currentKm) })}
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
  const router = useRouter();

  return (
    <section className="mb-1 rounded-3xl bg-(--color-surface) p-6 text-center shadow-sm ring-1 ring-(--color-border)/50">
      <p className="text-sm font-semibold text-(--color-text)">{primary}</p>
      <p className="mt-1 text-xs leading-relaxed text-(--color-text-muted)">{secondary}</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => router.push(ctaHref)}
        className="mt-4"
      >
        {ctaLabel}
      </Button>
    </section>
  );
}

function OilCard({
  stream,
  vehicleId,
  className,
  t,
  formatNumber,
  streamLabel,
  zoneLabel,
  formatKm,
}: {
  stream: OilStream;
  vehicleId: string;
  className?: string;
  t: ReturnType<typeof useTranslation>["t"];
  formatNumber: ReturnType<typeof useTranslation>["formatNumber"];
  streamLabel: (label: string) => string;
  zoneLabel: (zone: Zone) => string;
  formatKm: (value: number) => string;
}) {
  const label = streamLabel(stream.label);
  const intervalLabel =
    stream.intervalMid != null
      ? t("oilPage.interval", { km: formatNumber(stream.intervalMid) })
      : null;

  const router = useRouter();

  // No history yet — render a slim empty state inside the card so the user
  // can record the first service without leaving the page hierarchy.
  if (stream.pct == null) {
    return (
      <div
        className={`rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/50 transition-all duration-200 hover:shadow-md ${className ?? ""}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-(--color-text)">{label}</p>
          <span className="text-xs text-(--color-text-muted)">—</span>
        </div>
        {intervalLabel && (
          <p className="mt-0.5 text-xs text-(--color-text-muted)">{intervalLabel}</p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-(--color-bg) px-3 py-2.5">
          <span className="text-xs text-(--color-text-secondary)">
            {t("oilPage.noOilHistory")}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/vehicles/${vehicleId}/service-history`)}
            className="h-8 shrink-0 px-3 text-[11px]"
          >
            {t("oilPage.recordCta")}
          </Button>
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
          <p className="text-sm font-bold text-(--color-text)">{label}</p>
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
        aria-label={t("oilPage.intervalRemainingAria", { label })}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${z.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-(--color-text-muted)">
        <span>{t("oilPage.needsChange")}</span>
        <span>{t("oilPage.justChanged")}</span>
      </div>

      {stream.remainingKm != null && (
        <p className="mt-2 text-xs text-(--color-text-secondary)">
          {stream.remainingKm > 0
            ? t("oilPage.remaining", { km: formatKm(stream.remainingKm) })
            : t("oilPage.overdue", { km: formatKm(stream.remainingKm) })}
          {stream.remainingKm <= 0 && t("oilPage.overdueFromInterval")}
        </p>
      )}
    </div>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
