"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useSelectedVehicle } from "@/lib/selected-vehicle";
import { fetchMileageHistory, fetchVehicleDetail, fetchVehiclesForUser } from "@/lib/supabase";
import { engineIntervalMid, oilLifePercent } from "@/lib/oil-utils";
import type { MileageLog, Vehicle, VehicleDetail } from "@/lib/types";
import MileageChart from "@/components/MileageChart";
import FuelGauge from "@/components/FuelGauge";
import FuelLevelHero from "@/components/FuelLevelHero";
import OilLifeBar from "@/components/OilLifeBar";
import StatusBadge from "@/components/StatusBadge";
import EmptyVehicleState from "@/components/EmptyVehicleState";
import NotificationBell from "@/components/NotificationBell";
import { CardSkeleton, DetailSkeleton } from "@/components/LoadingSkeleton";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

/**
 * Greeting key per jam hari. Emoji tetap universal — hanya key-nya yang
 * bergantung ke jam. Kita return `TranslationKey` supaya caller bisa lewat
 * `t(...)` sendiri (satu source of truth, mudah dites).
 */
function getGreetingKey(): { key: TranslationKey; emoji: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { key: "greeting.morning", emoji: "☀️" };
  if (hour >= 12 && hour < 17) return { key: "greeting.afternoon", emoji: "🌤️" };
  if (hour >= 17 && hour < 21) return { key: "greeting.evening", emoji: "🌇" };
  return { key: "greeting.night", emoji: "🌙" };
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { t, formatNumber } = useTranslation();

  /**
   * Format relatif untuk `latest_mileage.created_at`. Dulu hardcoded Bahasa
   * Indonesia; sekarang ikut locale via `t(...)`. Dijadikan closure supaya
   * bisa akses `t` tanpa harus di-passing sebagai argumen.
   */
  const formatRelativeMileageUpdate = useCallback(
    (iso: string | undefined): string => {
      if (!iso) return t("dashboard.updateNever");
      const ts = new Date(iso).getTime();
      if (!Number.isFinite(ts)) return t("dashboard.updateNever");
      const diffMs = Date.now() - ts;
      const mins = Math.floor(diffMs / 60_000);
      if (mins < 1) return t("dashboard.updateJustNow");
      if (mins < 60) return t("dashboard.updateMinutesAgo", { n: mins });
      const hours = Math.floor(mins / 60);
      if (hours < 24) return t("dashboard.updateHoursAgo", { n: hours });
      const days = Math.floor(hours / 24);
      if (days === 1) return t("dashboard.updateOneDayAgo");
      if (days < 7) return t("dashboard.updateDaysAgo", { n: days });
      const weeks = Math.floor(days / 7);
      if (weeks === 1) return t("dashboard.updateOneWeekAgo");
      if (weeks < 5) return t("dashboard.updateWeeksAgo", { n: weeks });
      return t("dashboard.updateOverAMonth");
    },
    [t],
  );
  const { selectedVehicleId, setSelectedVehicleId, ready: selectionReady } = useSelectedVehicle();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [historyLogs, setHistoryLogs] = useState<MileageLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadVehicles = useCallback(async () => {
    const list = await fetchVehiclesForUser();
    setVehicles(list);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        await loadVehicles();
      } catch {
        if (!cancelled) setVehicles([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadVehicles]);

  /**
   * Stable boolean: only flips when the selected ID's *membership* in vehicles
   * changes. Using this instead of the raw `vehicles` array reference prevents
   * the detail-fetch effect from re-running every time the list is refreshed
   * (which previously caused a skeleton flash on every background sync).
   */
  const selectedIsValid = useMemo(() => {
    if (!selectedVehicleId) return false;
    return vehicles.some((v) => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  useEffect(() => {
    if (!selectionReady || !user || loadingList) return;
    if (vehicles.length === 0) return;

    if (selectedVehicleId && !selectedIsValid) {
      setSelectedVehicleId(null);
      router.replace("/overview");
      return;
    }

    if (!selectedVehicleId) {
      router.replace("/overview");
    }
  }, [
    selectionReady,
    user,
    loadingList,
    vehicles.length,
    selectedVehicleId,
    selectedIsValid,
    router,
    setSelectedVehicleId,
  ]);

  /**
   * Track which vehicleId currently has loaded detail so we can do *soft*
   * re-fetches (no skeleton flash) when the same vehicle gets re-fetched —
   * e.g. after a `mr:vehicle-data-changed` event or list refresh.
   */
  const detailVehicleIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectionReady || !user || loadingList || !selectedVehicleId) {
      detailVehicleIdRef.current = null;
      setDetail(null);
      setHistoryLogs([]);
      setLoadingDetail(false);
      setHistoryLoading(false);
      return;
    }

    if (!selectedIsValid) {
      detailVehicleIdRef.current = null;
      setDetail(null);
      setHistoryLogs([]);
      setLoadingDetail(false);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    const sameVehicle = detailVehicleIdRef.current === selectedVehicleId;
    (async () => {
      // Only show skeletons on a true vehicle switch; otherwise refresh quietly.
      if (!sameVehicle) {
        setLoadingDetail(true);
        setHistoryLoading(true);
      }
      try {
        const d = await fetchVehicleDetail(selectedVehicleId);
        if (cancelled) return;
        if (!d) {
          detailVehicleIdRef.current = null;
          setSelectedVehicleId(null);
          router.replace("/overview");
          setDetail(null);
          setHistoryLogs([]);
          return;
        }
        detailVehicleIdRef.current = selectedVehicleId;
        setDetail(d);
        try {
          const logs = await fetchMileageHistory(selectedVehicleId);
          if (!cancelled) setHistoryLogs(logs);
        } catch {
          if (!cancelled) setHistoryLogs([]);
        }
      } catch {
        if (!cancelled) {
          detailVehicleIdRef.current = null;
          setDetail(null);
          setHistoryLogs([]);
          setSelectedVehicleId(null);
          router.replace("/overview");
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
          setHistoryLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectionReady,
    user,
    loadingList,
    selectedVehicleId,
    selectedIsValid,
    router,
    setSelectedVehicleId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || loadingDetail || !detail) return;
    if (window.location.hash === "#mileage-history" || window.location.hash === "#mileage-chart") {
      window.requestAnimationFrame(() => {
        document.getElementById("mileage-chart")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [loadingDetail, detail]);

  useEffect(() => {
    const onDataChange = () => {
      if (!selectedVehicleId) return;
      // Fan out: detail / history / vehicles list are independent — Promise.all
      // halves the wall-clock cost vs. the previous sequential awaits.
      void (async () => {
        const [detailRes, logsRes] = await Promise.allSettled([
          fetchVehicleDetail(selectedVehicleId),
          fetchMileageHistory(selectedVehicleId),
          loadVehicles(),
        ]);
        if (detailRes.status === "fulfilled" && detailRes.value) {
          setDetail(detailRes.value);
        }
        if (logsRes.status === "fulfilled") {
          setHistoryLogs(logsRes.value);
        }
      })();
    };
    window.addEventListener("mr:vehicle-data-changed", onDataChange);
    return () => window.removeEventListener("mr:vehicle-data-changed", onDataChange);
  }, [selectedVehicleId, loadVehicles]);

  if (authLoading) {
    return (
      <div className="flex flex-col px-4 pt-6 sm:px-5 sm:pt-7">
        <div className="mb-5 animate-pulse space-y-2">
          <div className="h-5 w-36 rounded-lg bg-(--color-border)/60" />
          <div className="h-7 w-52 rounded-lg bg-(--color-border)/60" />
        </div>
        <DetailSkeleton />
      </div>
    );
  }

  if (!user) return null;

  if (!selectionReady || loadingList) {
    return (
      <div className="flex flex-col px-4 pt-6 sm:px-5 sm:pt-7">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (vehicles.length === 0) {
    const g = getGreetingKey();
    // Empty-state footnote di-render dari string i18n; kita split di
    // token `{km}` supaya bagian "KM" bisa tetap distyle bold seperti
    // sebelumnya. Menghindari `dangerouslySetInnerHTML` demi keamanan.
    const footnoteRaw = t("dashboard.emptyFootnote", { km: "__KM__" });
    const [before, after] = footnoteRaw.split("__KM__");
    return (
      // min-h-screen on the wrapper + flex-1 on <main> gives the empty state
      // a full-viewport canvas so its internal `flex-1 justify-center`
      // actually centers vertically (instead of hugging the header).
      // pb-32 keeps the card clear of the fixed BottomNav (≈ 88px tall +
      // safe-area inset on iOS).
      <div className="flex min-h-screen flex-col">
        <main className="flex flex-1 flex-col px-4 pb-32 pt-6 sm:px-5 sm:pt-7">
          <div className="mb-5">
            <p className="text-sm text-(--color-text-secondary)">
              {g.emoji} {t(g.key)}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{user.name}</h1>
          </div>
          <EmptyVehicleState
            ariaLabel={t("dashboard.emptyAddFirst")}
            footnote={
              <>
                {before}
                <span className="font-semibold text-(--color-text-secondary)">{t("nav.km")}</span>
                {after}
              </>
            }
          />
        </main>
      </div>
    );
  }

  if (!selectedVehicleId || loadingDetail || !detail) {
    if (selectedVehicleId && loadingDetail) {
      return (
        <div className="flex flex-col px-4 pt-6 sm:px-5 sm:pt-7">
          <DetailSkeleton />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center px-4 py-16 sm:px-5">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)" />
      </div>
    );
  }

  const greeting = getGreetingKey();
  const { vehicle, latest_mileage, motorcycle_category, oil_service } = detail;
  const vid = vehicle.id;
  const currentKm = latest_mileage?.mileage ?? 0;
  const engineMid =
    vehicle.type === "motorcycle" && motorcycle_category
      ? engineIntervalMid(motorcycle_category)
      : null;
  const enginePct =
    vehicle.type === "motorcycle" &&
    motorcycle_category?.has_engine_oil_interval &&
    engineMid != null
      ? oilLifePercent(currentKm, oil_service?.last_engine_oil_km ?? null, engineMid)
      : null;

  const hasOilHero =
    vehicle.type === "motorcycle" && Boolean(motorcycle_category?.has_engine_oil_interval);

  const oilInsightSublabel =
    engineMid != null
      ? t("dashboard.engineOilInterval", { km: formatNumber(engineMid) })
      : undefined;

  return (
    <div className="flex flex-col">
      <main className="flex flex-col gap-6 px-4 pb-6 pt-6 sm:gap-6 sm:px-6 sm:pb-8 sm:pt-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-(--color-text-secondary)">
              {greeting.emoji} {t(greeting.key)}
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-(--color-text)">{user.name}</h1>
          </div>
          <nav className="flex flex-wrap items-center justify-end gap-2" aria-label={t("dashboard.ariaQuickActions")}>
            <Link
              href="/overview"
              className="rounded-xl border border-(--color-border)/70 px-3 py-2 text-[11px] font-semibold text-(--color-text-secondary) transition-colors hover:border-(--color-border) hover:bg-(--color-surface-alt)"
            >
              {t("dashboard.changeVehicle")}
            </Link>
            <NotificationBell />
          </nav>
        </header>

        {/* Vehicle ringkas */}
        <Link
          href={`/vehicles/${vid}`}
          className="flex gap-4 rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-4 transition-colors hover:border-(--color-border) hover:bg-(--color-surface-alt)/40 active:scale-[0.99]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-surface-alt) text-xl">
            {vehicle.type === "motorcycle" ? "🏍️" : "🚗"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="truncate text-sm font-bold text-(--color-text)">{vehicle.name}</h2>
              <StatusBadge status={vehicle.status} />
            </div>
            <p className="mt-0.5 text-xs text-(--color-text-muted)">
              {vehicle.brand} · {vehicle.year}
              {vehicle.motorcycle_category_name ? (
                <span className="ml-1.5 rounded-md bg-(--color-surface-alt) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-text-secondary)">
                  {vehicle.motorcycle_category_name.replace(/^Motor\s/, "")}
                </span>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-(--color-border)/50 pt-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
                  {t("dashboard.lastKm")}
                </p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-(--color-text)">
                  {latest_mileage ? `${formatNumber(latest_mileage.mileage)} km` : "—"}
                </p>
              </div>
              <p className="max-w-[11rem] text-right text-[11px] text-(--color-text-muted)">
                {formatRelativeMileageUpdate(latest_mileage?.created_at)}
              </p>
            </div>
            <p className="mt-2 text-[11px] font-semibold text-(--color-text-muted)">{t("dashboard.vehicleDetail")}</p>
          </div>
        </Link>

        {/* Hero bensin (non-motor) — hidden, belum terpakai */}
        {/* {hasOilHero ? null : <FuelLevelHero level={vehicle.fuel_level} />} */}

        {/* Insight oli (motor dengan interval) */}
        {hasOilHero && (
          <Link
            href={`/vehicles/${vid}/oil`}
            className="block rounded-2xl transition-transform active:scale-[0.99]"
          >
            <OilLifeBar
              variant="engine"
              percent={enginePct}
              label={t("dashboard.engineOil")}
              sublabel={oilInsightSublabel}
              density="compact"
              insightHint={t("dashboard.oilTapHint")}
            />
          </Link>
        )}

        {/* Bensin: sekunder jika hero oli; detail gauge — hidden, belum terpakai */}
        {/* <Link
          href={`/vehicles/${vid}/fuel`}
          className="block rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-4 transition-colors hover:border-(--color-border)"
          aria-label={`Bensin ${vehicle.fuel_level} persen, buka halaman bensin dan estimasi`}
        >
          <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-wider text-(--color-text-muted)">
            {hasOilHero ? "Estimasi bensin" : "Detail & estimasi"}
          </p>
          <FuelGauge level={vehicle.fuel_level} />
        </Link> */}

        <Link
          href={`/vehicles/${vid}/service-history`}
          className="group flex items-center gap-4 rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-4 transition-colors hover:border-(--color-border) active:scale-[0.99]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-surface-alt) text-xl ring-1 ring-(--color-border)/50">
            🛠️
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">{t("dashboard.service")}</p>
            <p className="mt-0.5 text-sm font-bold text-(--color-text)">{t("dashboard.serviceHistory")}</p>
            <p className="mt-0.5 text-xs text-(--color-text-secondary)">{t("dashboard.serviceHistorySub")}</p>
          </div>
          <span className="shrink-0 text-sm font-bold text-(--color-text-muted) transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>

        {/* Reminder hero card — hidden, belum terpakai */}
        {/* {(() => {
          const overdueCount = (reminders ?? []).filter(
            (r) => r.is_overdue_km || r.is_overdue_date,
          ).length;
          const total = reminders?.length ?? 0;
          const hasOverdue = overdueCount > 0;
          const isEmpty = total === 0;

          const tone = hasOverdue
            ? {
                ring: "ring-1 ring-(--color-critical)/30",
                bg: "bg-red-50 dark:bg-red-900/15",
                accent: "text-(--color-critical)",
                badge:
                  "bg-(--color-critical)/12 text-(--color-critical) dark:bg-(--color-critical)/20",
                iconBg: "bg-(--color-critical)/15 text-(--color-critical)",
              }
            : isEmpty
              ? {
                  ring: "ring-1 ring-(--color-border)/60",
                  bg: "bg-(--color-surface)",
                  accent: "text-(--color-text-secondary)",
                  badge:
                    "bg-(--color-surface-alt) text-(--color-text-secondary)",
                  iconBg: "bg-(--color-surface-alt) text-(--color-text-muted)",
                }
              : {
                  ring: "ring-1 ring-(--color-good)/25",
                  bg: "bg-emerald-50/60 dark:bg-emerald-900/12",
                  accent: "text-(--color-good)",
                  badge:
                    "bg-(--color-good)/12 text-(--color-good) dark:bg-(--color-good)/20",
                  iconBg: "bg-(--color-good)/15 text-(--color-good)",
                };

          return (
            <Link
              href={`/vehicles/${vid}/reminder`}
              className={`group flex items-center gap-4 rounded-2xl p-4 transition-all hover:shadow-md active:scale-[0.99] ${tone.bg} ${tone.ring}`}
            >
              <div
                aria-hidden
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone.iconBg}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill={hasOverdue ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth={hasOverdue ? 0 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                    Reminder
                  </p>
                  {hasOverdue ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.badge}`}
                    >
                      {overdueCount} terlewat
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-base font-bold text-(--color-text)">
                  {isEmpty
                    ? "Belum ada reminder"
                    : hasOverdue
                      ? `${overdueCount} dari ${total} perlu perhatian`
                      : `${total} aktif · semua aman`}
                </p>
                <p className={`mt-1 text-xs font-semibold ${tone.accent}`}>
                  {isEmpty
                    ? "Atur jadwal servis →"
                    : hasOverdue
                      ? "Tinjau sekarang →"
                      : "Lihat detail →"}
                </p>
              </div>
              <span
                aria-hidden
                className="shrink-0 text-base font-bold text-(--color-text-muted) transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          );
        })()} */}

        <section id="mileage-chart" className="scroll-mt-28 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">{t("dashboard.mileageHistoryTitle")}</h2>
          {historyLoading ? (
            <div className="space-y-3">
              <CardSkeleton />
            </div>
          ) : (
            <div className="rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-4">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">{t("dashboard.mileageTrend")}</h3>
              <MileageChart logs={historyLogs} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

