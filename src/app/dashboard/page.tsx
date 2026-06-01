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

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: "Good Morning", emoji: "☀️" };
  if (hour >= 12 && hour < 17) return { text: "Good Afternoon", emoji: "🌤️" };
  if (hour >= 17 && hour < 21) return { text: "Good Evening", emoji: "🌇" };
  return { text: "Good Night", emoji: "🌙" };
}

/** Teks singkat untuk `latest_mileage.created_at` (Bahasa Indonesia). */
function formatRelativeMileageUpdate(iso: string | undefined): string {
  if (!iso) return "Belum ada pembaruan KM";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Belum ada pembaruan KM";
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Update baru saja";
  if (mins < 60) return `Update ${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Update ${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Update 1 hari lalu";
  if (days < 7) return `Update ${days} hari lalu`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "Update 1 minggu lalu";
  if (weeks < 5) return `Update ${weeks} minggu lalu`;
  return "Update lebih dari sebulan lalu";
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
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
              {getGreeting().emoji} {getGreeting().text}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{user.name}</h1>
          </div>
          <EmptyVehicleState
            ariaLabel="Add your first vehicle"
            footnote={
              <>
                Setelah ada kendaraan, tombol{" "}
                <span className="font-semibold text-(--color-text-secondary)">KM</span> di bar bawah
                membuka input kilometer untuk kendaraan yang dipilih di Home.
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

  const greeting = getGreeting();
  const { vehicle, latest_mileage, reminders, motorcycle_category, oil_service } = detail;
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
    engineMid != null ? `Sisa interval ±${engineMid.toLocaleString("id-ID")} km` : undefined;

  return (
    <div className="flex flex-col">
      <main className="flex flex-col gap-6 px-4 pb-6 pt-6 sm:gap-6 sm:px-6 sm:pb-8 sm:pt-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-(--color-text-secondary)">
              {greeting.emoji} {greeting.text}
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-(--color-text)">{user.name}</h1>
          </div>
          <nav className="flex flex-wrap items-center justify-end gap-2" aria-label="Aksi cepat">
            <Link
              href="/overview"
              className="rounded-xl border border-(--color-border)/70 px-3 py-2 text-[11px] font-semibold text-(--color-text-secondary) transition-colors hover:border-(--color-border) hover:bg-(--color-surface-alt)"
            >
              Ganti kendaraan
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
                  KM terakhir
                </p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-(--color-text)">
                  {latest_mileage ? `${latest_mileage.mileage.toLocaleString("id-ID")} km` : "—"}
                </p>
              </div>
              <p className="max-w-[11rem] text-right text-[11px] text-(--color-text-muted)">
                {formatRelativeMileageUpdate(latest_mileage?.created_at)}
              </p>
            </div>
            <p className="mt-2 text-[11px] font-semibold text-(--color-text-muted)">Detail kendaraan →</p>
          </div>
        </Link>

        {/* Hero: status utama. Untuk kendaraan dengan interval oli (motor),
            kita tidak menampilkan hero terpisah — bar oli di bawah sudah
            cukup informatif. Non-motor tetap pakai FuelLevelHero. */}
        {hasOilHero ? null : <FuelLevelHero level={vehicle.fuel_level} />}

        {/* Insight oli (motor dengan interval) */}
        {hasOilHero && (
          <Link
            href={`/vehicles/${vid}/oil`}
            className="block rounded-2xl transition-transform active:scale-[0.99]"
          >
            <OilLifeBar
              variant="engine"
              percent={enginePct}
              label="Oli mesin"
              sublabel={oilInsightSublabel}
              density="compact"
              insightHint="Tap untuk detail"
            />
          </Link>
        )}

        {/* Bensin: sekunder jika hero oli; detail gauge */}
        <Link
          href={`/vehicles/${vid}/fuel`}
          className="block rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-4 transition-colors hover:border-(--color-border)"
          aria-label={`Bensin ${vehicle.fuel_level} persen, buka halaman bensin dan estimasi`}
        >
          <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-wider text-(--color-text-muted)">
            {hasOilHero ? "Estimasi bensin" : "Detail & estimasi"}
          </p>
          <FuelGauge level={vehicle.fuel_level} />
        </Link>

        <Link
          href={`/vehicles/${vid}/service-history`}
          className="group flex items-center gap-4 rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-4 transition-colors hover:border-(--color-border) active:scale-[0.99]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-surface-alt) text-xl ring-1 ring-(--color-border)/50">
            🛠️
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">Servis</p>
            <p className="mt-0.5 text-sm font-bold text-(--color-text)">Riwayat servis</p>
            <p className="mt-0.5 text-xs text-(--color-text-secondary)">Tanggal, KM, jenis servis</p>
          </div>
          <span className="shrink-0 text-sm font-bold text-(--color-text-muted) transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>

        {/*
          Reminder hero card. Promoted from a small 2-col grid tile to a
          full-width banner because:
            • Reminders ARE the app's core job-to-be-done. Hiding them
              behind a count-only chip undersold the value.
            • With the workshops/peta tile removed, the column is freed up
              for a more informative single card.
            • Status-driven accent color makes overdue items LOUD without
              requiring users to drill in. Green/neutral when safe, red
              when something needs attention.
          We compute counts inline instead of in render-prep so the hook
          set stays unchanged and the logic lives next to its consumer.
        */}
        {(() => {
          const overdueCount = (reminders ?? []).filter(
            (r) => r.is_overdue_km || r.is_overdue_date,
          ).length;
          const total = reminders?.length ?? 0;
          const hasOverdue = overdueCount > 0;
          const isEmpty = total === 0;

          // Tone tokens kept inline — three states only, not worth a
          // separate util. If we add "mendekati" tier later this becomes
          // a small lookup map.
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
        })()}

        <section id="mileage-chart" className="scroll-mt-28 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">Riwayat kilometer</h2>
          {historyLoading ? (
            <div className="space-y-3">
              <CardSkeleton />
            </div>
          ) : (
            <div className="rounded-2xl border border-(--color-border)/70 bg-(--color-surface) p-4">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">Tren KM</h3>
              <MileageChart logs={historyLogs} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

