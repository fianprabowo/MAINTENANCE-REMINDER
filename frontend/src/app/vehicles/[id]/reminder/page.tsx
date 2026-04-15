"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Reminder } from "@/lib/types";
import CustomSelect from "@/components/CustomSelect";
import { CardSkeleton } from "@/components/LoadingSkeleton";
import { toast } from "sonner";

const serviceTypeOptions = [
  { value: "light", label: "Light (e.g. oil change)", icon: "🔧" },
  { value: "heavy", label: "Heavy (e.g. engine overhaul)", icon: "⚙️" },
];

export default function ReminderPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    service_type: "light" as "light" | "heavy",
    km_interval: "",
    date_interval_days: "",
    last_service_km: "",
    last_service_date: "",
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  const fetchReminders = async () => {
    try {
      const res = await api.get<Reminder[]>(`/vehicles/${id}/reminders`);
      setReminders(res.data || []);
    } catch {
      /* handled silently */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !id) return;
    fetchReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!e.currentTarget.checkValidity()) {
      e.currentTarget.classList.add("submitted");
      return;
    }
    setSubmitting(true);
    try {
      await api.post<Reminder>(`/vehicles/${id}/reminder`, {
        service_type: form.service_type,
        km_interval: parseInt(form.km_interval) || 0,
        date_interval_days: parseInt(form.date_interval_days) || 0,
        last_service_km: parseInt(form.last_service_km) || 0,
        last_service_date: form.last_service_date || undefined,
      });
      toast.success("Reminder created!");
      setShowForm(false);
      setForm({ service_type: "light", km_interval: "", date_interval_days: "", last_service_km: "", last_service_date: "" });
      setLoading(true);
      fetchReminders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create reminder");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) return null;

  const inputClass =
    "w-full rounded-2xl border border-(--color-border) px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        <button
          type="button"
          onClick={() => router.push(`/vehicles/${id}`)}
          className="mb-4 text-sm font-semibold text-(--color-text-secondary) transition-colors hover:text-(--color-text)"
        >
          ← Back to Vehicle
        </button>

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold uppercase tracking-wide">
            Reminders
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-2xl bg-(--color-primary) px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-(--color-primary)/30 transition-all hover:brightness-110"
          >
            {showForm ? "Cancel" : "+ New"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} noValidate className="mb-6 space-y-3 rounded-3xl bg-(--color-surface) p-5 shadow-sm">
            <CustomSelect
              options={serviceTypeOptions}
              value={form.service_type}
              onChange={(v) => setForm({ ...form, service_type: v as "light" | "heavy" })}
              placeholder="Select service type"
            />

            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={form.km_interval} onChange={(e) => setForm({ ...form, km_interval: e.target.value })} className={inputClass} placeholder="KM interval" min={0} />
              <input type="number" value={form.date_interval_days} onChange={(e) => setForm({ ...form, date_interval_days: e.target.value })} className={inputClass} placeholder="Days interval" min={0} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={form.last_service_km} onChange={(e) => setForm({ ...form, last_service_km: e.target.value })} className={inputClass} placeholder="Last service KM" min={0} />
              <input type="date" value={form.last_service_date} onChange={(e) => setForm({ ...form, last_service_date: e.target.value })} className={inputClass} />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-(--color-primary) py-4 text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Reminder"}
            </button>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : reminders.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-(--color-surface) p-12 text-center shadow-sm">
            <div className="mb-3 text-4xl">🔔</div>
            <p className="font-semibold text-(--color-text-secondary)">No reminders yet</p>
            <p className="mt-1 text-xs text-(--color-text-muted)">
              Create a service reminder to stay on top of maintenance
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => {
              const isOverdue = r.is_overdue_km || r.is_overdue_date;
              return (
                <div
                  key={r.id}
                  className={`rounded-3xl p-5 shadow-sm ${isOverdue ? "bg-red-50 dark:bg-red-900/20" : "bg-(--color-surface)"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{r.service_type === "light" ? "🔧" : "⚙️"}</span>
                      <span className="font-bold capitalize">{r.service_type} service</span>
                    </div>
                    {isOverdue && (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600 dark:bg-red-900/40 dark:text-red-400">
                        OVERDUE
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    {r.km_interval > 0 && (
                      <div>
                        <p className="text-xs text-(--color-text-muted)">KM Interval</p>
                        <p className="font-semibold">Every {r.km_interval.toLocaleString()} km</p>
                      </div>
                    )}
                    {r.date_interval_days > 0 && (
                      <div>
                        <p className="text-xs text-(--color-text-muted)">Days Interval</p>
                        <p className="font-semibold">Every {r.date_interval_days} days</p>
                      </div>
                    )}
                    {r.next_due_km > 0 && (
                      <div>
                        <p className="text-xs text-(--color-text-muted)">Next Due KM</p>
                        <p className={`font-semibold ${r.is_overdue_km ? "text-red-600 dark:text-red-400" : ""}`}>
                          {r.next_due_km.toLocaleString()} km
                        </p>
                      </div>
                    )}
                    {r.next_due_date && (
                      <div>
                        <p className="text-xs text-(--color-text-muted)">Next Due Date</p>
                        <p className={`font-semibold ${r.is_overdue_date ? "text-red-600 dark:text-red-400" : ""}`}>
                          {new Date(r.next_due_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
