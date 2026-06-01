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
import { toast } from "sonner";

const btnPress = "transition-all duration-200 active:scale-95";

/**
 * Initial + per-scroll page size for the mileage timeline. 10 keeps the
 * cold-load DOM small (cheap parse + scroll smoothness on low-end
 * devices) and still shows enough rows to convey "this is a list" on
 * first paint.
 */
const HISTORY_PAGE_SIZE = 10;

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
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<MileageLog[]>([]);
  // Pagination state for the timeline. We use cursor-based paging keyed
  // on the OLDEST visible row's `created_at`. `hasMore` is conservative:
  // we only assume more pages exist when the last fetch returned a full
  // page (=PAGE_SIZE rows). One-shot false trigger is fine because the
  // sentinel will simply unmount.
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  // Pending delete target — drives ConfirmDialog open state and carries
  // the row needed for both the user-facing message and the API call.
  const [pendingDeleteMileage, setPendingDeleteMileage] = useState<MileageLog | null>(null);
  const [deletingMileage, setDeletingMileage] = useState(false);

  const minRecordedMileage = detail?.latest_mileage?.mileage ?? 0;

  const refreshVehicleData = useCallback(async () => {
    if (!id) return;
    // Background refresh — preserve scroll-loaded state. If the user has
    // already paged further (e.g. 30 rows visible), refetching only the
    // first 10 would visually "lose" the lower entries until they re-
    // scrolled. So we re-fetch up to whatever they've already loaded
    // (capped at PAGE_SIZE on initial state).
    setHistoryLogs((prev) => {
      const fetchSize = Math.max(prev.length, HISTORY_PAGE_SIZE);
      void Promise.allSettled([
        fetchVehicleDetail(id as string),
        fetchMileageHistory(id as string, { limit: fetchSize }),
      ]).then(([detailRes, logsRes]) => {
        if (detailRes.status === "fulfilled" && detailRes.value) {
          setDetail(detailRes.value);
        }
        if (logsRes.status === "fulfilled") {
          setHistoryLogs(logsRes.value);
          // After a refresh we don't know if there's "more" beyond what
          // we asked for — assume yes only when the slot is full.
          setHasMoreHistory(logsRes.value.length === fetchSize);
        }
      });
      return prev; // setState callback used purely to read latest length
    });
  }, [id]);

  const loadMoreHistory = useCallback(async () => {
    if (!id || loadingMoreHistory || !hasMoreHistory) return;
    const cursor = historyLogs[historyLogs.length - 1]?.created_at;
    if (!cursor) return;
    setLoadingMoreHistory(true);
    try {
      const next = await fetchMileageHistory(id as string, {
        limit: HISTORY_PAGE_SIZE,
        before: cursor,
      });
      setHistoryLogs((prev) => [...prev, ...next]);
      // If fewer rows came back than requested, we've hit the end.
      setHasMoreHistory(next.length === HISTORY_PAGE_SIZE);
    } catch {
      // Soft fail: don't toast — user can scroll again to retry.
      // Setting hasMore=true again means the sentinel will trigger on
      // next intersection.
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [id, loadingMoreHistory, hasMoreHistory, historyLogs]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        // Initial cold load — fan out detail+history; both are independent.
        // History is paginated (lazy-loaded on scroll) so we only ask for
        // the first page here.
        const [detailRes, logsRes] = await Promise.all([
          fetchVehicleDetail(id as string),
          fetchMileageHistory(id as string, { limit: HISTORY_PAGE_SIZE }).catch(
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
        // If we got a full page back, there *might* be more — sentinel
        // will probe. If less, we've already shown everything.
        setHasMoreHistory(logsRes.length === HISTORY_PAGE_SIZE);
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
      toast.success("Catatan KM dihapus");
      // Refresh the detail card too — current KM may have changed if we
      // just deleted the latest entry. Fire-and-forget; optimistic state
      // already covers the timeline.
      void refreshVehicleData();
      setPendingDeleteMileage(null);
    } catch (err) {
      // Rollback optimistic removal so the timeline reflects truth.
      setHistoryLogs(previous);
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setDeletingMileage(false);
    }
  }, [pendingDeleteMileage, id, historyLogs, refreshVehicleData]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteVehicle(id as string);
      toast.success("Vehicle deleted");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
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
            {/* Top bar: back + delete icon */}
            <div className="mb-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className={`rounded-lg px-1 py-0.5 text-sm font-semibold text-(--color-text-secondary) hover:text-(--color-text) ${btnPress}`}
              >
                ← Kembali
              </button>

              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/15 dark:text-red-400 dark:hover:bg-red-900/30 ${btnPress}`}
                  title="Hapus kendaraan"
                  aria-label="Hapus kendaraan"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className={`rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${btnPress}`}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-200 disabled:pointer-events-none disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 ${btnPress}`}
                  >
                    {deleting ? "…" : "Hapus"}
                  </button>
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
                label="KM"
                value={currentKm !== undefined ? currentKm.toLocaleString("id-ID") : "—"}
                sub={currentKm !== undefined ? "odometer terkini" : "Ketuk untuk update"}
                onPress={openMileageModal}
                accent
              />
              <StatCard label="Fuel" value={`${detail.vehicle.fuel_level}%`} sub="level tangki" />
              <StatCard label="Reminder" value={`${reminderCount}`} sub={reminderCount === 1 ? "aktif" : "aktif"} />
              <StatCard label="Tipe" value={kategori} sub={detail.vehicle.type === "motorcycle" ? "motor" : "mobil"} />
            </section>

            {/* Action utama + sekunder */}
            <section className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={`/vehicles/${id}/service-history`}
                  className={`block rounded-xl bg-gray-100 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${btnPress}`}
                >
                  Riwayat servis
                </Link>
                <Link
                  href={`/vehicles/${id}/reminder`}
                  className={`block rounded-xl bg-gray-100 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${btnPress}`}
                >
                  Reminder
                </Link>
              </div>
              <Link
                href={`/vehicles/${id}/condition`}
                className={`flex items-center justify-between rounded-xl bg-gradient-to-br from-emerald-50 to-sky-50 px-4 py-3.5 text-sm font-semibold text-(--color-text) ring-1 ring-emerald-200/60 hover:from-emerald-100 hover:to-sky-100 dark:from-emerald-500/10 dark:to-sky-500/10 dark:ring-emerald-500/20 dark:hover:from-emerald-500/15 dark:hover:to-sky-500/15 ${btnPress}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-lg" aria-hidden>
                    🩺
                  </span>
                  <span className="flex flex-col">
                    <span>Kondisi part</span>
                    <span className="text-[11px] font-normal text-(--color-text-secondary)">
                      Cek umur tiap komponen
                    </span>
                  </span>
                </span>
                <span aria-hidden className="text-(--color-text-muted)">
                  →
                </span>
              </Link>
            </section>

            {/* Timeline KM */}
            <section
              id="mileage-timeline"
              className="mt-6 scroll-mt-24 rounded-xl bg-white p-4 shadow-sm ring-1 ring-(--color-border)/50 dark:bg-(--color-surface)"
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                  Timeline kilometer
                </h2>
                {historyLogs[0] ? (
                  <span className="text-[11px] font-semibold text-(--color-text-muted)">
                    Update terakhir · {formatRelative(historyLogs[0].created_at)}
                  </span>
                ) : null}
              </div>
              <HistoryTimeline logs={historyLogs} onDelete={requestDeleteMileage} />

              {/* Lazy-load sentinel + status row.
                  - Sentinel only renders when there *might* be more rows.
                    IntersectionObserver fires loadMore on entering viewport.
                  - Loading text shown while fetch in flight.
                  - "Akhir riwayat" indicator shown once we've reached the
                    end (>= page size of rows total). Tiny, low-emphasis.
              */}
              {hasMoreHistory ? (
                <HistorySentinel
                  onIntersect={() => void loadMoreHistory()}
                  loading={loadingMoreHistory}
                />
              ) : historyLogs.length > HISTORY_PAGE_SIZE ? (
                <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
                  Akhir riwayat
                </p>
              ) : null}
            </section>

            {/* Catatan — hanya jika ada */}
            {notes ? (
              <section className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-zinc-900/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">Catatan</p>
                <p className="mt-1 text-sm leading-relaxed text-(--color-text)">{notes}</p>
              </section>
            ) : null}

            {/* Reminder singkat */}
            {reminderCount > 0 && (
              <section className="mt-6">
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                  Pengingat servis
                </h2>
                <ul className="space-y-2.5">
                  {detail.reminders.map((r) => {
                    const isOverdue = r.is_overdue_km || r.is_overdue_date;
                    return (
                      <li
                        key={r.id}
                        className={`rounded-xl p-4 transition-all duration-200 hover:shadow-md ${
                          isOverdue ? "bg-red-50 dark:bg-red-900/20" : "bg-white shadow-sm ring-1 ring-(--color-border)/50 dark:bg-(--color-surface)"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold capitalize text-(--color-text)">
                            {r.service_type === "light" ? "Servis ringan" : "Servis besar"}
                          </span>
                          {isOverdue ? (
                            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-600 dark:bg-red-900/40 dark:text-red-400">
                              Overdue
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-text-secondary)">
                          {r.next_due_km > 0 && <span>Due at {r.next_due_km.toLocaleString("id-ID")} km</span>}
                          {r.next_due_date && (
                            <span>
                              Due {new Date(r.next_due_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
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
        title="Perbarui kilometer"
      />

      <ConfirmDialog
        open={!!pendingDeleteMileage}
        title="Hapus catatan KM?"
        message={
          pendingDeleteMileage
            ? `Catatan ${pendingDeleteMileage.mileage.toLocaleString("id-ID")} KM akan dihapus permanen. Jika ini catatan terbaru, KM kendaraan akan turun ke catatan sebelumnya.`
            : ""
        }
        confirmLabel={deletingMileage ? "Menghapus…" : "Hapus"}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={() => void confirmDeleteMileage()}
        onCancel={cancelDeleteMileage}
      />
    </div>
  );
}

/**
 * Invisible-ish sentinel that triggers `onIntersect` when the user
 * scrolls it into view (or near it via `rootMargin`). When loading is
 * true we render a spinner so users get feedback that more rows are on
 * the way.
 *
 * Why a separate component:
 *   - Encapsulates the IntersectionObserver lifecycle so the parent's
 *     useEffect dependency list stays clean.
 *   - Re-attaches the observer when `onIntersect` identity changes
 *     (which happens whenever historyLogs/cursor changes — exactly the
 *     points where a fresh observation should be allowed to fire).
 *   - rootMargin pre-fetches before the user actually hits the bottom,
 *     making the load feel seamless rather than "scroll-and-wait".
 */
function HistorySentinel({
  onIntersect,
  loading,
}: {
  onIntersect: () => void;
  loading: boolean;
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
        // Pre-load 200px before sentinel actually enters viewport so the
        // user rarely sees a "loading…" stall.
        rootMargin: "0px 0px 200px 0px",
        threshold: 0,
      },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [onIntersect]);

  return (
    <div
      ref={ref}
      className="flex h-10 items-center justify-center text-[11px] text-(--color-text-muted)"
      aria-live="polite"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)"
          />
          Memuat lebih banyak…
        </span>
      ) : null}
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}h lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
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
  onPress,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
  accent?: boolean;
}) {
  const body = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold tabular-nums ${accent ? "text-blue-600 dark:text-blue-400" : "text-(--color-text)"}`}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-(--color-text-secondary)">{sub}</p> : null}
    </>
  );

  const base =
    "rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-(--color-border)/40 transition-all duration-200 hover:shadow-md dark:bg-(--color-surface) dark:ring-(--color-border)/60";

  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={`${base} ${btnPress}`}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}
