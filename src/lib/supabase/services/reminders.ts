import { supabase } from "../client";
import { enrichReminders, mapReminder } from "../mappers";
import { requireUser } from "../auth-helpers";
import { getLatestMileageKm } from "./mileage";
import { getReminderPreset, type ReminderPresetSlug } from "@/lib/reminder-presets";
import { computeNextOccurrence, type ScheduleSpec } from "@/lib/reminder-schedule";
import type { Reminder } from "@/lib/types";

export async function fetchRemindersForVehicle(vehicleId: string): Promise<Reminder[]> {
  const user = await requireUser();

  const { data: v } = await supabase
    .from("vehicles")
    .select("user_id")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!v || v.user_id !== user.id) throw new Error("Vehicle not found");

  const latestKm = await getLatestMileageKm(vehicleId);

  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const list = (data ?? []).map((row) => mapReminder(row as Parameters<typeof mapReminder>[0]));
  return enrichReminders(list, latestKm);
}

/**
 * Create a reminder from a preset (Ganti oli, Servis rutin, …).
 *
 * Two trigger dimensions, each independently optional but at least one
 * required:
 *   • km — `use_km=true`. `km_interval` may override the preset default.
 *   • schedule — pass a `ScheduleSpec`. We normalize it into the four
 *     `schedule_*` columns and derive `next_due_date` for the legacy widgets
 *     that read it directly (dashboards, etc.).
 *
 * `last_service_km` is always pulled fresh from the latest mileage log so
 * the user never has to type their odometer twice.
 */
/**
 * Shape accepted by both create + update. Both operations recompute
 * `last_service_km` from the latest mileage log so the user never types
 * their odometer twice.
 */
export interface ReminderInput {
  preset_slug: ReminderPresetSlug;
  use_km: boolean;
  /**
   * Absolute KM target. When provided AND > current odometer, this wins
   * over `km_interval`. The DB stores both `next_due_km = target_km` and
   * `km_interval = target_km - current_km` so existing dashboards keep
   * working without knowing about the new shape.
   */
  target_km?: number;
  /** Legacy: km interval. Used only when target_km is not provided. */
  km_interval?: number;
  /**
   * What to do once km threshold is crossed.
   *   'once'  → flag once, then quiet (default)
   *   'daily' → re-flag every day until resolved
   * Ignored when `use_km` is false.
   */
  km_alert_mode?: "once" | "daily";
  /** Schedule definition. Omit / null ⇒ no time-based trigger. */
  schedule?: ScheduleSpec | null;
  /** YYYY-MM-DD. Defaults to today. Used for `last_service_date`. */
  last_service_date?: string;
}

export async function createReminderForVehicle(
  vehicleId: string,
  input: ReminderInput,
): Promise<Reminder> {
  const payload = await buildReminderPayload(vehicleId, input);
  const { data, error } = await supabase
    .from("reminders")
    .insert({ vehicle_id: vehicleId, ...payload })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReminder(data as Parameters<typeof mapReminder>[0]);
}

/**
 * Update an existing reminder in place. Same payload shape as create — we
 * fully overwrite the trigger fields so editing an overdue reminder cleanly
 * resets `last_service_km` to today's odometer.
 */
export async function updateReminderForVehicle(
  reminderId: string,
  vehicleId: string,
  input: ReminderInput,
): Promise<Reminder> {
  const payload = await buildReminderPayload(vehicleId, input);
  const { data, error } = await supabase
    .from("reminders")
    .update(payload)
    .eq("id", reminderId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapReminder(data as Parameters<typeof mapReminder>[0]);
}

export async function deleteReminderForVehicle(reminderId: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", reminderId);
  if (error) throw new Error(error.message);
}

/* ──────────────────────────────────────────────────────────────────
 * Payload builder — shared by create + update
 * ──────────────────────────────────────────────────────────────── */

async function buildReminderPayload(vehicleId: string, input: ReminderInput) {
  const preset = getReminderPreset(input.preset_slug);
  if (!preset) throw new Error(`Preset reminder tidak dikenal: ${input.preset_slug}`);

  const hasSchedule = !!input.schedule;
  if (!input.use_km && !hasSchedule) {
    throw new Error("Pilih minimal satu: KM atau jadwal waktu");
  }

  const lastKm = await getLatestMileageKm(vehicleId);
  const baseDateYmd = input.last_service_date?.trim() || todayYmd();

  // Resolve km trigger. Prefer `target_km` (absolute) — it's race-resistant
  // because we recompute the interval against the *server's* fresh lastKm.
  let kmInterval = 0;
  let nextDueKm = 0;
  if (input.use_km) {
    if (typeof input.target_km === "number") {
      if (input.target_km <= lastKm) {
        throw new Error(
          `Target KM (${input.target_km.toLocaleString("id-ID")}) harus lebih besar dari KM saat ini (${lastKm.toLocaleString("id-ID")})`,
        );
      }
      nextDueKm = input.target_km;
      kmInterval = input.target_km - lastKm;
    } else {
      kmInterval = input.km_interval ?? preset.km;
      if (kmInterval <= 0) throw new Error("KM interval harus lebih dari 0");
      nextDueKm = lastKm + kmInterval;
    }
  }

  const sched = normalizeSchedule(input.schedule ?? null);

  let nextDueDate: string | null = null;
  if (sched.spec) {
    const next = computeNextOccurrence(sched.spec);
    if (next) nextDueDate = next.toISOString();
  }

  return {
    service_type: preset.service_type,
    preset_slug: preset.slug,
    km_interval: kmInterval,
    // Legacy field — kept at 0 in the new schedule model. We don't try to
    // back-translate "monthly" into "30 days" because that'd lie at month
    // boundaries; readers should prefer `schedule_kind` when present.
    date_interval_days: 0,
    last_service_km: lastKm,
    last_service_date: baseDateYmd,
    next_due_km: nextDueKm,
    next_due_date: nextDueDate,
    schedule_kind: sched.kind,
    schedule_once_at: sched.once_at,
    schedule_weekdays: sched.weekdays,
    schedule_day_of_month: sched.day_of_month,
    km_alert_mode: input.use_km ? (input.km_alert_mode ?? "once") : "once",
  };
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

interface NormalizedSchedule {
  spec: ScheduleSpec | null;
  kind: ScheduleSpec["kind"] | null;
  once_at: string | null;
  weekdays: number[] | null;
  day_of_month: number | null;
}

function normalizeSchedule(spec: ScheduleSpec | null): NormalizedSchedule {
  if (!spec) {
    return { spec: null, kind: null, once_at: null, weekdays: null, day_of_month: null };
  }
  switch (spec.kind) {
    case "once":
      if (!spec.once_at) throw new Error("Tanggal reminder belum dipilih");
      return {
        spec,
        kind: "once",
        once_at: spec.once_at,
        weekdays: null,
        day_of_month: null,
      };
    case "daily":
      return { spec, kind: "daily", once_at: null, weekdays: null, day_of_month: null };
    case "weekly": {
      const days = (spec.weekdays ?? []).filter((d) => d >= 0 && d <= 6);
      const unique = Array.from(new Set(days));
      if (unique.length === 0) throw new Error("Pilih minimal satu hari untuk jadwal mingguan");
      return {
        spec: { kind: "weekly", weekdays: unique },
        kind: "weekly",
        once_at: null,
        weekdays: unique,
        day_of_month: null,
      };
    }
    case "monthly": {
      const dom = spec.day_of_month;
      if (!dom || dom < 1 || dom > 31) {
        throw new Error("Pilih tanggal 1–31 untuk jadwal bulanan");
      }
      return {
        spec,
        kind: "monthly",
        once_at: null,
        weekdays: null,
        day_of_month: dom,
      };
    }
  }
}

function todayYmd(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
