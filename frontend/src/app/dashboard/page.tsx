"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Vehicle } from "@/lib/types";
import VehicleCard from "@/components/VehicleCard";
import { CardSkeleton } from "@/components/LoadingSkeleton";

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: "Good Morning", emoji: "☀️" };
  if (hour >= 12 && hour < 17) return { text: "Good Afternoon", emoji: "🌤️" };
  if (hour >= 17 && hour < 21) return { text: "Good Evening", emoji: "🌇" };
  return { text: "Good Night", emoji: "🌙" };
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const fetchVehicles = async () => {
      try {
        const res = await api.get<Vehicle[]>("/vehicles?page=1&limit=50");
        setVehicles(res.data || []);
      } catch {
        /* handled silently */
      } finally {
        setLoading(false);
      }
    };
    fetchVehicles();
  }, [user]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col px-5 pt-8">
        <div className="mb-6 animate-pulse space-y-2">
          <div className="h-5 w-36 rounded-lg bg-(--color-border)/60" />
          <div className="h-7 w-52 rounded-lg bg-(--color-border)/60" />
        </div>
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-(--color-border)/40" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const greeting = getGreeting();
  const totalVehicles = vehicles.length;
  const needsAttention = vehicles.filter((v) => v.status === "warning" || v.status === "critical").length;
  const avgFuel = totalVehicles > 0
    ? Math.round(vehicles.reduce((sum, v) => sum + v.fuel_level, 0) / totalVehicles)
    : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col px-5 pb-8 pt-8">
        {/* Greeting */}
        <div className="mb-6">
          <p className="text-sm text-(--color-text-secondary)">
            {greeting.emoji} {greeting.text}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
            {user.name}
          </h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : vehicles.length === 0 ? (
          <DashboardEmptyState />
        ) : (
          <>
            {/* Summary stats */}
            <div className="mb-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-(--color-surface) p-3 text-center shadow-sm">
                <p className="text-xl font-bold">{totalVehicles}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-muted)">
                  Vehicles
                </p>
              </div>
              <div className="rounded-2xl bg-(--color-surface) p-3 text-center shadow-sm">
                <p className={`text-xl font-bold ${needsAttention > 0 ? "text-(--color-warning)" : "text-(--color-good)"}`}>
                  {needsAttention}
                </p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-muted)">
                  Attention
                </p>
              </div>
              <div className="rounded-2xl bg-(--color-surface) p-3 text-center shadow-sm">
                <p className="text-xl font-bold">{avgFuel}%</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-(--color-text-muted)">
                  Avg Fuel
                </p>
              </div>
            </div>

            {/* Vehicle list */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
                My Vehicles
              </h2>
              <span className="rounded-full bg-(--color-surface) px-2.5 py-0.5 text-[10px] font-bold text-(--color-text-muted)">
                {totalVehicles}
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {vehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

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
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DashboardEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-1 py-6 sm:py-10">
      <Link
        href="/vehicles/add"
        className="group flex w-full max-w-[280px] flex-col items-center rounded-[1.75rem] border border-(--color-border) bg-(--color-surface) p-6 pb-7 text-center shadow-sm ring-1 ring-black/[0.03] transition-all hover:border-(--color-primary)/35 hover:shadow-md hover:ring-(--color-primary)/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg) active:scale-[0.98] dark:ring-white/[0.04]"
        aria-label="Add your first vehicle"
      >
        <div
          className="mb-5 flex h-[7.25rem] w-full max-w-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-(--color-primary)/35 bg-(--color-primary-soft) transition-colors group-hover:border-(--color-primary)/55 group-hover:bg-(--color-primary)/15"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-(--color-primary) text-white shadow-lg shadow-(--color-primary)/35 transition-transform group-hover:scale-105 group-active:scale-95">
            <PlusIcon className="h-11 w-11" />
          </div>
        </div>
        <h2 className="text-lg font-bold tracking-tight text-(--color-text)">
          No vehicles yet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-(--color-text-secondary)">
          Add a vehicle to track mileage, fuel, and service reminders in one place.
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-primary)">
          <span className="rounded-lg bg-(--color-primary-soft) px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-(--color-primary)">
            Tap to add
          </span>
        </span>
      </Link>
      <p className="mt-6 max-w-[260px] text-center text-xs text-(--color-text-muted)">
        You can also use the{" "}
        <span className="font-semibold text-(--color-text-secondary)">+</span>{" "}
        button in the bar below.
      </p>
    </div>
  );
}
