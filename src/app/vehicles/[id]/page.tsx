"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  deleteMileageLog,
  deleteVehicle,
  fetchMileageHistory,
  fetchVehicleDetail,
} from "@/lib/supabase";
import type { MileageLog, VehicleDetail } from "@/lib/types";
import HistoryTimeline from "@/components/HistoryTimeline";
import AddMileageModal from "@/components/AddMileageModal";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DetailSkeleton } from "@/components/LoadingSkeleton";
import { Button, IconButton, SectionLabel } from "@/components/ui";
import { toast } from "sonner";
import { useAppErrorMessage, useTranslation } from "@/lib/i18n";

const btnPress = "transition-all duration-200 active:scale-95";

/**
 * Timeline mileage pagination — hybrid FE reveal strategy:
 *
 *   1. Fetch SEKALI dari DB dengan cap `HISTORY_MAX_FETCH` (500 rows).
 *      Untuk user tipikal (< 200 entries/tahun) ini fetch semua history
 *      dalam 1 round-trip → payload ~40KB gzipped, mobile 4G < 500ms.
 *      Sebelumnya cursor-based backend paging (fetch 10 → scroll → fetch 10 lagi)
 *      yang bikin extra network round-trip tiap scroll → laggy UX.
 *
 *   2. Client-side reveal `HISTORY_VISIBLE_INCREMENT` (10) rows per scroll.
 *      IntersectionObserver bertugas trigger `setVisibleCount(v => v + 10)`
 *      saat sentinel masuk viewport. Karena data sudah di-memory, reveal
 *      instant (tidak perlu loading state).
 *
 *   3. Cap 500 = safety net untuk user dengan history sangat panjang
 *      (mis. commercial vehicle 10+ tahun). Kalau mereka hit cap, kita
 *      show subtle "500 latest" notice — trade-off yang acceptable karena
 *      user jarang butuh scroll balik ratusan entries.
 *
 * Dashboard mileage chart tetap pakai default `limit=50` di service
 * (untuk chart yang cuma butuh recent data), tidak terpengaruh.
 */
const HISTORY_MAX_FETCH = 500;
const HISTORY_VISIBLE_INCREMENT = 10;

function BackIcon({ className }: { className?: string }) {
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
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { t, formatNumber, formatDate, locale } = useTranslation();
  const describeAppError = useAppErrorMessage();
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<MileageLog[]>([]);
  // FE-pagination state: berapa banyak row yang saat ini ditampilkan.
  // Semua data sudah di-fetch upfront (satu round-trip, cap 500).
  // Increment via IntersectionObserver saat user scroll ke bawah.
  const [visibleCount, setVisibleCount] = useState(HISTORY_VISIBLE_INCREMENT);
  // Pending delete target — drives ConfirmDialog open state and carries
  // the row needed for both the user-facing message and the API call.
  const [pendingDeleteMileage, setPendingDeleteMileage] = useState<MileageLog | null>(null);
  const [deletingMileage, setDeletingMileage] = useState(false);

  const minRecordedMileage = detail?.latest_mileage?.mileage ?? 0;

  const refreshVehicleData = useCallback(async () => {
    if (!id) return;
    // Background refresh — refetch full history (up to cap). Karena semua
    // history sudah di-memory, ini cukup re-sync tanpa perlu track offset
    // atau cursor. `visibleCount` sengaja TIDAK direset supaya scroll
    // position user tetap terjaga (mis. dia sudah reveal 30 rows, setelah
    // tambah mileage baru dia masih lihat 30 rows terbaru).
    void Promise.allSettled([
      fetchVehicleDetail(id as string),
      fetchMileageHistory(id as string, { limit: HISTORY_MAX_FETCH }),
    ]).then(([detailRes, logsRes]) => {
      if (detailRes.status === "fulfilled" && detailRes.value) {
        setDetail(detailRes.value);
      }
      if (logsRes.status === "fulfilled") {
        setHistoryLogs(logsRes.value);
      }
    });
  }, [id]);

  // Reveal 10 more rows from the already-fetched array. Pure state
  // update — no network call, so no loading state needed.
  const showMoreHistory = useCallback(() => {
    setVisibleCount((v) =>
      Math.min(v + HISTORY_VISIBLE_INCREMENT, historyLogs.length),
    );
  }, [historyLogs.length]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        // Initial cold load — fan out detail + FULL history (cap 500) in
        // parallel. History dipagination di FE (lihat konstanta di atas),
        // jadi kita fetch semua sekaligus di sini supaya scroll reveal
        // berikutnya tidak butuh network round-trip lagi.
        const [detailRes, logsRes] = await Promise.all([
          fetchVehicleDetail(id as string),
          fetchMileageHistory(id as string, { limit: HISTORY_MAX_FETCH }).catch(
            () => [] as MileageLog[],
          ),
        ]);
        if (cancelled) return;
        if (!detailRes) {
          router.replace("/dashboard");
          return;
        }
        setDetail(detailRes);
        setHistoryLogs(logsRes);
      } catch {
        if (!cancelled) router.replace("/dashboard");
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  useEffect(() => {
    if (typeof window === "undefined" || loading || !detail) return;
    if (window.location.hash === "#mileage-timeline") {
      window.requestAnimationFrame(() => {
        document.getElementById("mileage-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [loading, detail]);

  useEffect(() => {
    const h = () => {
      void refreshVehicleData();
    };
    window.addEventListener("mr:vehicle-data-changed", h);
    return () => window.removeEventListener("mr:vehicle-data-changed", h);
  }, [refreshVehicleData]);

  const openMileageModal = useCallback(() => {
    setMileageModalOpen(true);
  }, []);

  const requestDeleteMileage = useCallback((log: MileageLog) => {
    // SwipeableRow already handed us intent — we route through the
    // standard ConfirmDialog so the destructive step always carries
    // explicit user confirmation (consistent with overview / reminder
    // / service-history delete flows).
    setPendingDeleteMileage(log);
  }, []);

  const cancelDeleteMileage = useCallback(() => {
    if (deletingMileage) return; // guard mid-flight dismissal
    setPendingDeleteMileage(null);
  }, [deletingMileage]);

  const confirmDeleteMileage = useCallback(async () => {
    const target = pendingDeleteMileage;
    if (!target || !id) return;
    setDeletingMileage(true);

    // Optimistic removal — keep the snapshot to roll back on error.
    const previous = historyLogs;
    setHistoryLogs((prev) => prev.filter((l) => l.id !== target.id));

    try {
      await deleteMileageLog(target.id, id as string);
      // The DB trigger already recomputed vehicles.current_mileage_km.
      // Broadcast so reminders/notifications/dashboard re-derive their
      // status from the new max odometer reading.
      window.dispatchEvent(new CustomEvent("mr:vehicle-data-changed"));
      toast.success(t("vehicleDetail.mileageDeleted"));
      // Refresh the detail card too — current KM may have changed if we
      // just deleted the latest entry. Fire-and-forget; optimistic state
      // already covers the timeline.
      void refreshVehicleData();
      setPendingDeleteMileage(null);
    } catch (err) {
      // Rollback optimistic removal so the timeline reflects truth.
      setHistoryLogs(previous);
      toast.error(describeAppError(err, t("vehicleDetail.mileageDeleteFailed")));
    } finally {
      setDeletingMileage(false);
    }
  }, [pendingDeleteMileage, id, historyLogs, refreshVehicleData, t, describeAppError]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteVehicle(id as string);
      toast.success(t("vehicleDetail.vehicleDeleted"));
      router.replace("/dashboard");
    } catch (err) {
      toast.error(describeAppError(err, t("vehicleDetail.vehicleDeleteFailed")));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (authLoading || !user) return null;

  const notes = detail?.vehicle.notes?.trim() ?? "";
  const currentKm = detail?.latest_mileage?.mileage;
  const reminderCount = detail?.reminders?.length ?? 0;
  const kategori = detail?.motorcycle_category?.name_display?.replace(/^Motor\s/, "") ?? "—";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        {loading || !detail ? (
          <DetailSkeleton />
        ) : (
          <>
            {/* Top bar: back + delete */}
            <div className="mb-5 flex items-center justify-between">
              <IconButton
                label={t("vehicleDetail.back")}
                variant="ghost"
                size="lg"
                onClick={() => router.push("/dashboard")}
                className="-ml-2"
              >
                <BackIcon className="h-5 w-5" />
              </IconButton>

              {!confirmDelete ? (
                <IconButton
                  label={t("vehicleDetail.deleteAria")}
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  // Grayscale destructive: base neutral (text-secondary), hover
                  // ramps up ke full text + subtle bg. Warning weight ada di
                  // ConfirmDialog yang muncul saat click, bukan di icon color.
                  className="text-(--color-text-secondary) hover:bg-(--color-surface-alt) hover:text-(--color-text)"
                >
                  <TrashIcon className="h-5 w-5" />
                </IconButton>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    {t("vehicleDetail.cancelSlim")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDelete()}
                    loading={deleting}
                  >
                    {t("vehicleDetail.deleteSlim")}
                  </Button>
                </div>
              )}
            </div>

            {/* Header */}
            <header className="mb-6 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-(--color-surface) text-2xl" aria-hidden>
                {detail.vehicle.type === "motorcycle" ? "🏍️" : "🚗"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="truncate text-xl font-bold text-(--color-text)">{detail.vehicle.name}</h1>
                  <StatusBadge status={detail.vehicle.status} />
                </div>
                <p className="mt-1 text-sm text-(--color-text-secondary)">
                  {detail.vehicle.brand} · {detail.vehicle.year}
                </p>
              </div>
            </header>

            {/* Ringkasan — 1 section, grid 2 kolom, card ringan */}
            <section className="grid grid-cols-2 gap-3">
              <StatCard
                label={t("vehicleDetail.statKm")}
                value={currentKm !== undefined ? formatNumber(currentKm) : "—"}
                sub={currentKm !== undefined ? t("vehicleDetail.statKmSubActive") : t("vehicleDetail.statKmSubEmpty")}
                accent
              />
              <StatCard
                label={t("vehicleDetail.statFuel")}
                value={`${detail.vehicle.fuel_level}%`}
                sub={t("vehicleDetail.statFuelSub")}
              />
              <StatCard
                label={t("vehicleDetail.statReminder")}
                value={`${reminderCount}`}
                sub={t("vehicleDetail.statReminderSub")}
              />
              <StatCard
                label={t("vehicleDetail.statType")}
                value={kategori}
                sub={detail.vehicle.type === "motorcycle" ? t("vehicleDetail.statTypeMotorcycle") : t("vehicleDetail.statTypeCar")}
              />
            </section>

            <Button variant="primary" size="lg" fullWidth className="mt-5" onClick={openMileageModal}>
              {t("motorFuelEstimator.addKm")}
            </Button>

            {/* Action utama + sekunder */}
            <section className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/*
                  Secondary CTA pair — migrasi dari hardcoded gray-100/zinc-800
                  ke design token (`--color-surface-alt` + `--color-text-secondary`).
                  Konsisten dengan `Button variant="secondary"` primitive.
                */}
                <Link
                  href={`/vehicles/${id}/service-history`}
                  className={`block rounded-xl bg-(--color-surface-alt) py-3 text-center text-sm font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-surface) hover:text-(--color-text) ${btnPress}`}
                >
                  {t("vehicleDetail.ctaServiceHistory")}
                </Link>
                <Link
                  href={`/vehicles/${id}/reminder`}
                  className={`block rounded-xl bg-(--color-surface-alt) py-3 text-center text-sm font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-surface) hover:text-(--color-text) ${btnPress}`}
                >
                  {t("vehicleDetail.ctaReminder")}
                </Link>
              </div>
              <Link
                href={`/vehicles/${id}/condition`}
                // Gradient decorative (emerald→sky) di-neutralize jadi solid
                // surface — match login tone (flat neutral, tanpa gradient
                // color).
                className={`flex items-center justify-between rounded-xl bg-(--color-surface-alt) px-4 py-3.5 text-sm font-semibold text-(--color-text) ring-1 ring-(--color-border)/60 transition-colors hover:bg-(--color-surface) ${btnPress}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-lg" aria-hidden>
                    🩺
                  </span>
                  <span className="flex flex-col">
                    <span>{t("vehicleDetail.ctaConditionTitle")}</span>
                    <span className="text-[11px] font-normal text-(--color-text-secondary)">
                      {t("vehicleDetail.ctaConditionSub")}
                    </span>
                  </span>
                </span>
                <span aria-hidden className="text-(--color-text-muted)">
                  →
                </span>
              </Link>
            </section>

            {/* Timeline KM — pakai `--color-surface` (auto-adapt via .dark),
                bukan `bg-white dark:bg-(--color-surface)`. Lebih clean. */}
            <section
              id="mileage-timeline"
              className="mt-6 scroll-mt-24 rounded-xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/50"
            >
              <div className="mb-3 flex items-baseline justify-between">
                <SectionLabel as="h2">{t("vehicleDetail.timelineTitle")}</SectionLabel>
                {historyLogs[0] ? (
                  <span className="text-[11px] font-semibold text-(--color-text-muted)">
                    {t("vehicleDetail.lastUpdateAt", { when: formatRelativeLocalized(historyLogs[0].created_at, { t, formatDate, locale }) })}
                  </span>
                ) : null}
              </div>
              <HistoryTimeline
                logs={historyLogs.slice(0, visibleCount)}
                onDelete={requestDeleteMileage}
              />

              {/* Scroll-to-reveal sentinel + counter hint — FE pagination.
                  - Data sudah di-memory (fetched upfront), jadi tidak ada
                    async load. Sentinel cukup increment `visibleCount`.
                  - Counter text jadi visual affordance: tanpa ini user
                    tidak tahu ada row tersembunyi (sentinel invisible).
                    Copy: "Menampilkan 10 dari 47 · scroll untuk memuat lebih".
                  - Setelah semua row terlihat, tampilkan "end of history"
                    label sebagai visual anchor. Threshold-nya = increment
                    (10) supaya label tidak muncul untuk list pendek yang
                    tidak butuh reveal sama sekali.
              */}
              {visibleCount < historyLogs.length ? (
                <>
                  <p
                    className="mt-3 text-center text-[11px] font-medium text-(--color-text-muted)"
                    aria-live="polite"
                  >
                    {t("vehicleDetail.historyPaginationCounter", {
                      shown: visibleCount,
                      total: historyLogs.length,
                    })}
                  </p>
                  <HistorySentinel onIntersect={showMoreHistory} />
                </>
              ) : historyLogs.length > HISTORY_VISIBLE_INCREMENT ? (
                <SectionLabel className="mt-3 text-center">{t("vehicleDetail.endOfHistory")}</SectionLabel>
              ) : null}
            </section>

            {/* Catatan — hanya jika ada */}
            {notes ? (
              // Notes section — migrasi ke `--color-surface` token supaya
              // theme-consistent (dulu bg-gray-50 / bg-zinc-900/60 hardcoded).
              <section className="mt-4 rounded-xl bg-(--color-surface) p-4 ring-1 ring-(--color-border)/50">
                <SectionLabel>{t("vehicleDetail.notesTitle")}</SectionLabel>
                <p className="mt-1 text-sm leading-relaxed text-(--color-text)">{notes}</p>
              </section>
            ) : null}

            {/* Reminder singkat */}
            {reminderCount > 0 && (
              <section className="mt-6">
                <SectionLabel as="h2" className="mb-3">
                  {t("vehicleDetail.serviceReminderTitle")}
                </SectionLabel>
                <ul className="space-y-2.5">
                  {detail.reminders.map((r) => {
                    const isOverdue = r.is_overdue_km || r.is_overdue_date;
                    return (
                      <li
                        key={r.id}
                        className={`rounded-xl p-4 transition-all duration-200 hover:shadow-md ${
                          // Grayscale overdue highlight: subtle bg + strong ring,
                          // bukan red tint. Urgency via border weight.
                          isOverdue
                            ? "bg-(--color-surface-alt) ring-2 ring-(--color-text)/30"
                            : "bg-(--color-surface) shadow-sm ring-1 ring-(--color-border)/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold capitalize text-(--color-text)">
                            {r.service_type === "light" ? t("vehicleDetail.serviceLight") : t("vehicleDetail.serviceHeavy")}
                          </span>
                          {isOverdue ? (
                            // Inverted "loud" badge — dark bg + light text.
                            <span className="rounded-full bg-(--color-text) px-2.5 py-0.5 text-[11px] font-bold text-(--color-bg)">
                              {t("vehicleDetail.overdueBadge")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-text-secondary)">
                          {r.next_due_km > 0 && <span>{t("vehicleDetail.dueAtKm", { km: formatNumber(r.next_due_km) })}</span>}
                          {r.next_due_date && (
                            <span>
                              {t("vehicleDetail.dueOn", {
                                date: formatDate(r.next_due_date, { day: "numeric", month: "short", year: "numeric" }),
                              })}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      {id && (
        <Suspense fallback={null}>
          <MileageFromQuery vehicleId={id as string} detail={detail} onOpen={openMileageModal} />
        </Suspense>
      )}
      <AddMileageModal
        open={mileageModalOpen && !!id}
        onClose={() => setMileageModalOpen(false)}
        vehicleId={(id as string) ?? ""}
        minMileage={minRecordedMileage}
        onSaved={refreshVehicleData}
        title={t("vehicleDetail.updateMileageTitle")}
      />

      <ConfirmDialog
        open={!!pendingDeleteMileage}
        title={t("vehicleDetail.deleteMileageTitle")}
        message={
          pendingDeleteMileage
            ? t("vehicleDetail.deleteMileageMessage", { km: formatNumber(pendingDeleteMileage.mileage) })
            : ""
        }
        confirmLabel={deletingMileage ? t("vehicleDetail.deletingMileage") : t("vehicleDetail.deleteMileageConfirm")}
        cancelLabel={t("vehicleDetail.deleteMileageCancel")}
        variant="danger"
        onConfirm={() => void confirmDeleteMileage()}
        onCancel={cancelDeleteMileage}
      />
    </div>
  );
}

/**
 * Sentinel yang trigger `onIntersect` saat user scroll ke area sentinel
 * (atau mendekatinya via `rootMargin`). Karena data sudah di-memory
 * (FE pagination — lihat konstanta HISTORY_MAX_FETCH di atas), sentinel
 * ini pure trigger tanpa loading state.
 *
 * Why separate component:
 *   - Encapsulates the IntersectionObserver lifecycle so the parent's
 *     useEffect dependency list stays clean.
 *   - Re-attaches the observer when `onIntersect` identity changes
 *     (which happens whenever historyLogs.length changes — exactly the
 *     point where a fresh observation should be allowed to fire).
 *   - rootMargin pre-triggers before the user actually hits the bottom,
 *     making the reveal feel seamless.
 */
function HistorySentinel({
  onIntersect,
}: {
  onIntersect: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Guard for SSR / very old browsers (defensive — Next 13+ targets
    // browsers that all support IntersectionObserver).
    if (typeof IntersectionObserver === "undefined") {
      onIntersect();
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) onIntersect();
      },
      {
        // Pre-trigger 200px before sentinel actually enters viewport so
        // the reveal feels seamless (rows appear before user hits bottom).
        rootMargin: "0px 0px 200px 0px",
        threshold: 0,
      },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [onIntersect]);

  // Small transparent sentinel — no visible UI needed since reveal is
  // instant (no async load). Keeps DOM cheap.
  return <div ref={ref} aria-hidden className="h-6" />;
}

/**
 * Formatter waktu relatif untuk timeline header. Kita ambil `t` &
 * `formatDate` sebagai argumen (bukan bikin closure di dalam) supaya
 * fungsi ini tetap pure & aman dipakai di luar React tree bila perlu.
 */
function formatRelativeLocalized(
  iso: string,
  ctx: {
    t: (k: Parameters<ReturnType<typeof useTranslation>["t"]>[0], v?: Record<string, string | number>) => string;
    formatDate: ReturnType<typeof useTranslation>["formatDate"];
    locale: string;
  },
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return ctx.t("vehicleDetail.relJustNow");
  if (mins < 60) return ctx.t("vehicleDetail.relMinutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ctx.t("vehicleDetail.relHours", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return ctx.t("vehicleDetail.relDays", { n: days });
  return ctx.formatDate(d, { day: "numeric", month: "short" });
}

function MileageFromQuery({
  vehicleId,
  detail,
  onOpen,
}: {
  vehicleId: string;
  detail: VehicleDetail | null;
  onOpen: () => void;
}) {
  const searchParams = useSearchParams();
  const openedRef = useRef(false);

  useEffect(() => {
    openedRef.current = false;
  }, [vehicleId]);

  useEffect(() => {
    if (!detail || openedRef.current) return;
    if (detail.vehicle.id !== vehicleId) return;
    if (searchParams.get("mileage") !== "1") return;
    openedRef.current = true;
    onOpen();
    window.history.replaceState(null, "", `/vehicles/${vehicleId}`);
  }, [detail, vehicleId, searchParams, onOpen]);

  return null;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-(--color-surface) p-4 text-left shadow-sm ring-1 ring-(--color-border)/40 transition-all duration-200 hover:shadow-md">
      <SectionLabel>{label}</SectionLabel>
      {/*
       * `accent` sekarang cuma pakai font-weight yang lebih strong — sebelumnya
       * text-blue-600 (biru). Login tone monochrome jadi kita tidak bedain
       * accent stat pakai hue, tapi via weight/size (extra-bold sudah cukup).
       */}
      <p className={`mt-1 truncate text-lg font-bold tabular-nums text-(--color-text) ${accent ? "font-extrabold" : ""}`}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-(--color-text-secondary)">{sub}</p> : null}
    </div>
  );
}
