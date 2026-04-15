"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Vehicle, MileageLog } from "@/lib/types";
import CustomSelect from "@/components/CustomSelect";
import { toast } from "sonner";

const yearOptions = Array.from({ length: 36 }, (_, i) => {
  const y = String(2035 - i);
  return { value: y, label: y };
});

export default function AddVehiclePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "" as "" | "car" | "motorcycle",
    brand: "",
    year: "",
    fuel_level: "",
    initial_mileage: "",
    notes: "",
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    if (!form.type || !form.name.trim() || !form.brand.trim() || !form.year) {
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<Vehicle>("/vehicles", {
        name: form.name,
        type: form.type,
        brand: form.brand,
        year: parseInt(form.year),
        fuel_level: form.fuel_level ? parseInt(form.fuel_level) : 100,
        notes: form.notes || undefined,
      });

      if (form.initial_mileage && res.data) {
        await api.post<MileageLog>(`/vehicles/${res.data.id}/mileage`, {
          mileage: parseInt(form.initial_mileage),
        });
      }

      toast.success("Vehicle added!");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add vehicle");
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    "w-full rounded-2xl border bg-(--color-surface) px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20";

  const inputClass = `${inputBase} border-(--color-border)`;

  const errorBorder = (value: string) =>
    submitted && !value.trim()
      ? `${inputBase} border-red-300 dark:border-red-800/60`
      : inputClass;

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

        <div className="mb-8">
          <h1 className="text-2xl font-extrabold tracking-tight">
            New Vehicle
          </h1>
          <p className="mt-1 text-sm text-(--color-text-secondary)">
            Fill in the details below to start tracking
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {/* Vehicle Type - Card selector */}
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
              Vehicle Type *
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: "car", icon: "🚗", label: "Car" },
                { value: "motorcycle", icon: "🏍️", label: "Motorcycle" },
              ] as const).map((opt) => {
                const isActive = form.type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, type: opt.value })}
                    className={`flex flex-col items-center gap-2 rounded-2xl border-2 py-5 text-sm font-semibold transition-all ${
                      isActive
                        ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary) shadow-sm"
                        : submitted && !form.type
                          ? "border-red-300 bg-(--color-surface) text-(--color-text-secondary) dark:border-red-800/60"
                          : "border-(--color-border) bg-(--color-surface) text-(--color-text-secondary) hover:border-(--color-text-muted)"
                    }`}
                  >
                    <span className="text-3xl">{opt.icon}</span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vehicle Info */}
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
              Vehicle Info
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={errorBorder(form.name)}
                placeholder="Vehicle name (e.g. My Honda Jazz) *"
                required
              />

              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className={errorBorder(form.brand)}
                placeholder="Brand / manufacturer (e.g. Honda) *"
                required
              />

              <CustomSelect
                options={yearOptions}
                value={form.year}
                onChange={(v) => setForm({ ...form, year: v })}
                placeholder="Year of manufacture *"
                required
                maxHeight={220}
                error={submitted && !form.year}
              />
            </div>
          </div>

          {/* Condition */}
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
              Current Condition
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="number"
                    value={form.initial_mileage}
                    onChange={(e) => setForm({ ...form, initial_mileage: e.target.value })}
                    className={inputClass}
                    placeholder="Current KM"
                    min={0}
                    inputMode="numeric"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--color-text-muted)">
                    km
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    value={form.fuel_level}
                    onChange={(e) => setForm({ ...form, fuel_level: e.target.value })}
                    className={inputClass}
                    placeholder="Fuel level"
                    min={0}
                    max={100}
                    inputMode="numeric"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--color-text-muted)">
                    %
                  </span>
                </div>
              </div>

              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass + " resize-none"}
                rows={3}
                placeholder="Notes — anything else worth remembering (optional)"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-(--color-primary) py-4 text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Vehicle"}
          </button>
        </form>
      </main>
    </div>
  );
}
