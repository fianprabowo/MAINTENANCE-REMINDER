"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useSelectedVehicle } from "@/lib/selected-vehicle";
import { deleteVehicle, fetchVehiclesForUser } from "@/lib/supabase";
import { Vehicle } from "@/lib/types";
import VehicleCard from "@/components/VehicleCard";
import { CardSkeleton } from "@/components/LoadingSkeleton";
import SwipeableRow from "@/components/SwipeableRow";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyVehicleState from "@/components/EmptyVehicleState";
import { SectionLabel } from "@/components/ui";
import { useAppErrorMessage, useTranslation } from "@/lib/i18n";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function OverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { selectedVehicleId, setSelectedVehicleId } = useSelectedVehicle();
  const { t } = useTranslation();
  const describeAppError = useAppErrorMessage();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  // Swipe-to-delete state. We hoist the "currently open" id here so only one
  // card can be slid open at a time (matches iOS Mail / Gmail conventions).
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  // Pending deletion shown in the confirmation dialog. Storing the full
  // vehicle (not just id) lets us name it in the dialog body.
  const [pendingDelete, setPendingDelete] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchVehiclesForUser();
        if (!cancelled) setVehicles(list);
      } catch {
        if (!cancelled) setVehicles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handlePick = (v: Vehicle) => {
    setSelectedVehicleId(v.id);
    router.push("/dashboard");
  };

  // Step 1 of delete: open the confirmation dialog. The actual destructive
  // call only fires after the user explicitly confirms.
  const requestDelete = (v: Vehicle) => {
    setPendingDelete(v);
  };

  // Step 2: confirmed. We close the swipe row first (so it doesn't snap back
  // visually after the optimistic remove), then call the API.
  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target || deleting) return;

    setDeleting(true);
    setOpenSwipeId(null);

    // Optimistic update — remove the row from the list immediately so the UI
    // feels instant. Restore on failure.
    const previous = vehicles;
    setVehicles((prev) => prev.filter((v) => v.id !== target.id));

    try {
      await deleteVehicle(target.id);

      // If the deleted vehicle was the active one, clear the selection so
      // Home doesn't end up rendering a ghost. We stay on Overview so the
      // user can immediately tap another card to set a new active vehicle.
      if (selectedVehicleId === target.id) {
        setSelectedVehicleId(null);
        toast.success(t("overview.deletedActiveToast", { name: target.name }));
      } else {
        toast.success(t("overview.deletedToast", { name: target.name }));
      }
    } catch (err) {
      // Rollback the optimistic update on failure.
      setVehicles(previous);
      toast.error(describeAppError(err, t("overview.deleteFailed")));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  if (authLoading || !user) return null;

  const totalVehicles = vehicles.length;
  const needsAttention = vehicles.filter((v) => v.status === "warning" || v.status === "critical").length;
  const avgFuel =
    totalVehicles > 0
      ? Math.round(vehicles.reduce((sum, v) => sum + v.fuel_level, 0) / totalVehicles)
      : 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* pb-32 reserves space for the fixed BottomNav so (a) the last
          vehicle card isn't covered when the list scrolls, and (b) the
          empty state centers within the *visible* area rather than the
          full viewport (which would put it behind the nav). */}
      <main className="flex flex-1 flex-col px-5 pb-32 pt-8">
        <div className="mb-6">
          <SectionLabel>{t("overview.eyebrow")}</SectionLabel>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("overview.title")}</h1>
          <p className="mt-1 text-sm text-(--color-text-secondary)">
            {t("overview.subtitle")}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : vehicles.length === 0 ? (
          <EmptyVehicleState ariaLabel={t("overview.emptyCta")} />
        ) : (
          <>
            <div className="mb-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-(--color-surface) p-3 text-center shadow-sm">
                <p className="text-xl font-bold">{totalVehicles}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-muted)">
                  {t("overview.statsVehicles")}
                </p>
              </div>
              <div className="rounded-2xl bg-(--color-surface) p-3 text-center shadow-sm">
                {/*
                  Stat "butuh perhatian" — urgency di-encode via visual weight
                  (grayscale mode): >0 = full text + extra-bold, 0 = muted.
                  Sebelumnya pakai --color-warning vs --color-good yang di
                  grayscale-mode nilainya sangat berdekatan (mid-gray vs
                  light-gray) — sulit dibaca. Sekarang perbedaannya jelas.
                */}
                <p
                  className={`text-xl ${needsAttention > 0 ? "font-black text-(--color-text)" : "font-bold text-(--color-text-muted)"}`}
                >
                  {needsAttention}
                </p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-muted)">
                  {t("overview.statsAttention")}
                </p>
              </div>
              <div className="rounded-2xl bg-(--color-surface) p-3 text-center shadow-sm">
                <p className="text-xl font-bold">{avgFuel}%</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-muted)">
                  {t("overview.statsAvgFuel")}
                </p>
              </div>
            </div>

            {/* "Add slot" tile — dashed border keeps the affordance light so
                it doesn't compete with the actual vehicle list, while sitting
                in the hero slot keeps it discoverable above the fold. */}
            <Link
              href="/vehicles/add"
              className="group mb-6 flex items-center gap-3.5 rounded-2xl border-2 border-dashed border-(--color-primary)/35 bg-(--color-primary-soft)/30 p-4 transition-all hover:border-(--color-primary)/60 hover:bg-(--color-primary-soft)/60 active:scale-[0.99]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-primary-soft) text-(--color-primary) transition-transform group-hover:scale-110">
                <PlusIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-(--color-primary)">{t("overview.addVehicle")}</p>
                <p className="mt-0.5 text-xs text-(--color-text-secondary)">
                  {t("overview.addSubtitle")}
                </p>
              </div>
              <span className="shrink-0 text-(--color-primary)/60 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>

            <div className="mb-3 flex items-center justify-between">
              <SectionLabel as="h2">{t("overview.listTitle")}</SectionLabel>
              <span className="rounded-full bg-(--color-surface) px-2.5 py-0.5 text-[10px] font-bold text-(--color-text-muted)">
                {totalVehicles}
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {vehicles.map((vehicle) => (
                <SwipeableRow
                  key={vehicle.id}
                  isOpen={openSwipeId === vehicle.id}
                  onOpenChange={(open) =>
                    setOpenSwipeId(open ? vehicle.id : openSwipeId === vehicle.id ? null : openSwipeId)
                  }
                  onAction={() => requestDelete(vehicle)}
                  disabled={deleting}
                >
                  <VehicleCard
                    vehicle={vehicle}
                    pickMode
                    onPick={handlePick}
                    isActivePick={selectedVehicleId === vehicle.id}
                  />
                </SwipeableRow>
              ))}
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={!!pendingDelete}
        title={t("overview.deleteTitle")}
        message={
          pendingDelete
            ? t("overview.deleteMessage", { name: pendingDelete.name })
            : ""
        }
        confirmLabel={deleting ? t("overview.deleting") : t("overview.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
