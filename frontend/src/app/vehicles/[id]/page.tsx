"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { MileageLog, VehicleDetail } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { CardSkeleton, DetailSkeleton } from "@/components/LoadingSkeleton";
import HistoryTimeline from "@/components/HistoryTimeline";
import MileageChart from "@/components/MileageChart";
import { toast } from "sonner";

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
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
  const [historyLogs, setHistoryLogs] = useState<MileageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mileageModalOpen, setMileageModalOpen] = useState(false);
  const [mileageInput, setMileageInput] = useState("");
  const [mileageSaving, setMileageSaving] = useState(false);

  const minRecordedMileage = detail?.latest_mileage?.mileage ?? 0;

  const refreshVehicleData = useCallback(async () => {
    if (!id) return;
    try {
      const [detailRes, histRes] = await Promise.all([
        api.get<VehicleDetail>(`/vehicles/${id}`),
        api.get<MileageLog[]>(`/vehicles/${id}/history?page=1&limit=50`),
      ]);
      if (detailRes.data) setDetail(detailRes.data);
      setHistoryLogs(histRes.data || []);
    } catch {
      /* keep existing state on background refresh */
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setHistoryLoading(true);
      try {
        const detailRes = await api.get<VehicleDetail>(`/vehicles/${id}`);
        if (cancelled) return;
        if (detailRes.data) setDetail(detailRes.data);
        else {
          router.replace("/dashboard");
          return;
        }
      } catch {
        if (!cancelled) router.replace("/dashboard");
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const histRes = await api.get<MileageLog[]>(`/vehicles/${id}/history?page=1&limit=50`);
        if (!cancelled) setHistoryLogs(histRes.data || []);
      } catch {
        if (!cancelled) setHistoryLogs([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  useEffect(() => {
    if (typeof window === "undefined" || loading || !detail) return;
    if (window.location.hash === "#mileage-history") {
      document.getElementById("mileage-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, detail]);

  const openMileageModal = () => {
    const current = detail?.latest_mileage?.mileage;
    setMileageInput(current !== undefined ? String(current) : "");
    setMileageModalOpen(true);
  };

  const handleMileageModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(mileageInput, 10);
    if (Number.isNaN(n) || n < minRecordedMileage) {
      toast.error(
        minRecordedMileage > 0
          ? `Mileage must be at least ${minRecordedMileage.toLocaleString()} km`
          : "Enter a valid odometer reading",
      );
      return;
    }
    setMileageSaving(true);
    try {
      await api.post<MileageLog>(`/vehicles/${id}/mileage`, { mileage: n });
      toast.success("Mileage updated");
      setMileageModalOpen(false);
      await refreshVehicleData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update mileage");
    } finally {
      setMileageSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/vehicles/${id}`);
      toast.success("Vehicle deleted");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        {loading || !detail ? (
          <DetailSkeleton />
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="text-sm font-semibold text-(--color-text-secondary) transition-colors hover:text-(--color-text)"
              >
                ← Back
              </button>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-400 transition-colors hover:bg-red-100 hover:text-red-500 dark:bg-red-900/15 dark:text-red-400/70 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                  title="Delete vehicle"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-xl bg-(--color-surface) px-3 py-2 text-xs font-semibold shadow-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-xl bg-red-100 px-3 py-2 text-xs font-bold text-red-600 shadow-sm transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                  >
                    {deleting ? "..." : "Confirm"}
                  </button>
                </div>
              )}
            </div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-(--color-surface) text-3xl shadow-sm">
                {detail.vehicle.type === "car" ? "🚗" : "🏍️"}
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold">{detail.vehicle.name}</h1>
                <p className="text-sm text-(--color-text-secondary)">
                  {detail.vehicle.brand} &middot; {detail.vehicle.year}
                </p>
              </div>
              <StatusBadge status={detail.vehicle.status} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon="📏"
                label="Current KM"
                value={
                  detail.latest_mileage
                    ? `${detail.latest_mileage.mileage.toLocaleString()}`
                    : "N/A"
                }
                onPress={openMileageModal}
                hint="Tap to update"
              />
              <StatCard icon="⛽" label="Fuel Level" value={`${detail.vehicle.fuel_level}%`} />
              <StatCard icon="🔧" label="Reminders" value={`${detail.reminders?.length || 0} active`} />
              <StatCard icon="📋" label="Type" value={detail.vehicle.type} />
            </div>

            {detail.vehicle.notes && (
              <div className="mt-4 rounded-2xl bg-(--color-surface) p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
                  Notes
                </p>
                <p className="mt-1 text-sm">{detail.vehicle.notes}</p>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <Link
                href={`/vehicles/${id}/mileage`}
                className="block w-full rounded-2xl bg-(--color-primary) py-4 text-center text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90"
              >
                Add Mileage
              </Link>
              <Link
                href={`/vehicles/${id}/reminder`}
                className="block w-full rounded-2xl bg-(--color-surface) py-3.5 text-center text-sm font-semibold text-(--color-text) shadow-sm transition-all hover:shadow-md"
              >
                Reminders
              </Link>
            </div>

            <section id="mileage-history" className="mt-8 scroll-mt-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-(--color-text-muted)">
                Mileage history
              </h2>
              {historyLoading ? (
                <div className="space-y-4">
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : (
                <>
                  <div className="rounded-3xl bg-(--color-surface) p-5 shadow-sm">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">
                      Mileage trend
                    </h3>
                    <MileageChart logs={historyLogs} />
                  </div>
                  <div className="rounded-3xl bg-(--color-surface) p-5 shadow-sm">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-(--color-text-muted)">
                      Timeline
                    </h3>
                    <HistoryTimeline logs={historyLogs} />
                  </div>
                </>
              )}
            </section>

            {detail.reminders && detail.reminders.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-(--color-text-muted)">
                  Service Reminders
                </h2>
                <div className="space-y-3">
                  {detail.reminders.map((r) => {
                    const isOverdue = r.is_overdue_km || r.is_overdue_date;
                    return (
                      <div
                        key={r.id}
                        className={`rounded-2xl p-4 ${isOverdue
                            ? "bg-red-50 dark:bg-red-900/20"
                            : "bg-(--color-surface)"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold capitalize">
                            {r.service_type} service
                          </span>
                          {isOverdue && (
                            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/40 dark:text-red-400">
                              Overdue
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-(--color-text-secondary)">
                          {r.next_due_km > 0 && (
                            <span>Due at {r.next_due_km.toLocaleString()} km</span>
                          )}
                          {r.next_due_date && (
                            <span>Due {new Date(r.next_due_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {mileageModalOpen && detail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !mileageSaving) setMileageModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-(--color-bg) p-6 shadow-2xl"
            role="dialog"
            aria-labelledby="mileage-dialog-title"
          >
            <h2 id="mileage-dialog-title" className="text-lg font-bold">
              Update current KM
            </h2>
            <p className="mt-1 text-sm text-(--color-text-secondary)">
              New reading must be at least{" "}
              <span className="font-semibold text-(--color-text)">
                {minRecordedMileage.toLocaleString()} km
              </span>
              {minRecordedMileage === 0 ? " (first entry)" : ""}.
            </p>
            <form onSubmit={handleMileageModalSubmit} className="mt-5 space-y-4">
              <input
                type="number"
                inputMode="numeric"
                value={mileageInput}
                onChange={(e) => setMileageInput(e.target.value)}
                min={minRecordedMileage}
                required
                className="w-full rounded-2xl border border-(--color-border) px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20"
                placeholder="Odometer (km)"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={mileageSaving}
                  onClick={() => setMileageModalOpen(false)}
                  className="flex-1 rounded-2xl bg-(--color-surface) py-3.5 text-sm font-semibold shadow-sm transition-colors hover:shadow-md disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mileageSaving}
                  className="flex-1 rounded-2xl bg-(--color-primary) py-3.5 text-sm font-bold text-white shadow-lg shadow-(--color-primary)/25 transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {mileageSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  onPress,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  onPress?: () => void;
  hint?: string;
}) {
  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-lg">{icon}</span>
        {hint && onPress && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-(--color-primary)">
            {hint}
          </span>
        )}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
        {label}
      </p>
      <p className="mt-0.5 text-base font-bold capitalize">{value}</p>
    </>
  );

  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        className="rounded-2xl bg-(--color-surface) p-4 text-left shadow-sm ring-(--color-primary)/0 transition-all hover:shadow-md hover:ring-2 hover:ring-(--color-primary)/20 active:scale-[0.98]"
      >
        {body}
      </button>
    );
  }

  return <div className="rounded-2xl bg-(--color-surface) p-4 shadow-sm">{body}</div>;
}
