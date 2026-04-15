"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { MileageLog, VehicleDetail } from "@/lib/types";
import { toast } from "sonner";

export default function AddMileagePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mileage, setMileage] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(true);
  const [minMileage, setMinMileage] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const res = await api.get<VehicleDetail>(`/vehicles/${id}`);
        if (!cancelled) setMinMileage(res.data?.latest_mileage?.mileage ?? 0);
      } catch {
        if (!cancelled) router.replace("/dashboard");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, router]);

  if (authLoading || !user) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const n = parseInt(mileage, 10);
    if (Number.isNaN(n) || n < minMileage) {
      toast.error(
        minMileage > 0
          ? `Mileage must be at least ${minMileage.toLocaleString()} km`
          : "Enter a valid odometer reading",
      );
      return;
    }
    setLoading(true);
    try {
      await api.post<MileageLog>(`/vehicles/${id}/mileage`, {
        mileage: n,
      });
      toast.success("Mileage recorded!");
      router.push(`/vehicles/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record mileage");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-sm font-semibold text-(--color-text-secondary) transition-colors hover:text-(--color-text)"
        >
          ← Back
        </button>

        <h1 className="mb-2 text-2xl font-extrabold uppercase tracking-wide">
          Add Mileage
        </h1>
        <p className="mb-6 text-sm text-(--color-text-secondary)">
          {detailLoading
            ? "Loading vehicle…"
            : minMileage > 0
              ? `Reading must be at least ${minMileage.toLocaleString()} km (latest recorded).`
              : "Record your current odometer reading (first entry)."}
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <input
            type="number"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            disabled={detailLoading}
            className="w-full rounded-2xl border border-(--color-border) px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20 disabled:opacity-60"
            placeholder={detailLoading ? "…" : minMileage > 0 ? `Min ${minMileage.toLocaleString()} km` : "e.g. 15000"}
            min={minMileage}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-(--color-primary) py-4 text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Mileage"}
          </button>
        </form>
      </main>
    </div>
  );
}
