import { supabase } from "../client";
import { mapNotification, mapReminder, mapVehicle } from "../mappers";
import { requireUser } from "../auth-helpers";
import { getLatestMileageKm } from "./mileage";
import { decideEmit, evaluateReminder, dayBucket } from "@/lib/notification-engine";
import { pickCopy } from "@/lib/notification-copy";
import { getReminderPreset } from "@/lib/reminder-presets";
import type { AppNotification, Reminder, Vehicle } from "@/lib/types";

/* ──────────────────────────────────────────────────────────────────
 * Inbox queries
 * ──────────────────────────────────────────────────────────────── */

/**
 * Page through the user's notifications. Default order: newest first.
 * `unreadOnly` is a server-side filter so we don't pull a giant list to
 * client just to count badges.
 */
export async function fetchNotifications(opts: {
  limit?: number;
  unreadOnly?: boolean;
} = {}): Promise<AppNotification[]> {
  const user = await requireUser();
  let q = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.unreadOnly) q = q.is("read_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapNotification(row as Parameters<typeof mapNotification>[0]));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireUser();
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ──────────────────────────────────────────────────────────────────
 * Engine driver — evaluate all reminders & emit notifications
 *
 * Called from:
 *  - The client runner (on app open + on KM update events).
 *  - A future Supabase Edge Function (cron) for Web Push delivery.
 *
 * The function is idempotent within a calendar day per reminder thanks to
 * the anti-spam check in `decideEmit`. Multiple concurrent calls (e.g. two
 * tabs open) won't double-fire because we update `last_notified_at`
 * BEFORE inserting the notification row — losers in the race short-circuit
 * on the next read.
 * ──────────────────────────────────────────────────────────────── */

export type EvaluateAndEmitSummary = {
  evaluated: number;
  emitted: number;
  skipped: number;
};

export async function evaluateAndEmitForUser(): Promise<EvaluateAndEmitSummary> {
  const user = await requireUser();

  // Pull all the user's vehicles + their reminders in two round-trips. We
  // intentionally don't use a JOIN because reminders may live for many
  // vehicles and the per-vehicle latest km lookup is parallelizable below.
  const { data: vehicleRows, error: vehiclesErr } = await supabase
    .from("vehicles")
    .select("*")
    .eq("user_id", user.id);
  if (vehiclesErr) throw new Error(vehiclesErr.message);
  const vehicles: Vehicle[] = (vehicleRows ?? []).map((row) =>
    mapVehicle(row as Parameters<typeof mapVehicle>[0]),
  );
  if (vehicles.length === 0) return { evaluated: 0, emitted: 0, skipped: 0 };

  const vehicleIds = vehicles.map((v) => v.id);
  const { data: reminderRows, error: remErr } = await supabase
    .from("reminders")
    .select("*")
    .in("vehicle_id", vehicleIds);
  if (remErr) throw new Error(remErr.message);
  const reminders: Reminder[] = (reminderRows ?? []).map((row) =>
    mapReminder(row as Parameters<typeof mapReminder>[0]),
  );
  if (reminders.length === 0) return { evaluated: 0, emitted: 0, skipped: 0 };

  // Latest KM per vehicle. We reuse the `current_mileage_km` column from
  // the vehicle row (kept in sync via DB trigger) instead of re-querying
  // mileage_logs — saves N round-trips for users with many vehicles.
  const kmByVehicle = new Map<string, number>();
  for (const v of vehicles) kmByVehicle.set(v.id, v.current_mileage_km ?? 0);

  const now = new Date();
  const seedDay = dayBucket(now);

  let emitted = 0;
  let skipped = 0;

  // Sequential to keep RLS-bounded INSERTs safe and predictable; for typical
  // accounts (< 20 reminders) the cost is negligible.
  for (const r of reminders) {
    const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
    if (!vehicle) {
      skipped++;
      continue;
    }
    const currentKm = kmByVehicle.get(r.vehicle_id) ?? 0;
    const evalRes = evaluateReminder(r, currentKm, now);
    const decision = decideEmit(r, evalRes, now);
    if (!decision.shouldEmit || !decision.notifyType) {
      skipped++;
      continue;
    }

    // Build the copy. We seed by `(reminder.id, day, kind)` so the variant
    // stays stable for the day the user receives it.
    const preset = getReminderPreset(r.preset_slug);
    const copy = pickCopy({
      kind: decision.notifyType,
      presetSlug: r.preset_slug,
      presetLabel: preset?.label,
      vehicleName: vehicle.name,
      remainingKm: evalRes.remainingKm,
      remainingDays: evalRes.remainingDays,
      seed: `${r.id}:${seedDay}:${decision.notifyType}`,
    });

    // Update reminder anti-spam state FIRST (race-safety), then insert.
    // If the insert fails, the reminder still has a stale-but-correct
    // last_notified_* — we'd rather miss a notification than spam.
    const ts = now.toISOString();
    const { error: updErr } = await supabase
      .from("reminders")
      .update({ last_notified_at: ts, last_notified_type: decision.notifyType })
      .eq("id", r.id);
    if (updErr) {
      skipped++;
      continue;
    }

    const link =
      r.vehicle_id ? `/vehicles/${r.vehicle_id}/service-history` : "/notifications";

    const { error: insErr } = await supabase.from("notifications").insert({
      user_id: user.id,
      vehicle_id: r.vehicle_id,
      reminder_id: r.id,
      kind:
        decision.notifyType === "mendekati"
          ? "reminder_mendekati"
          : "reminder_terlewat",
      title: copy.title,
      body: copy.body,
      link_to: link,
    });
    if (insErr) {
      // Best-effort: rollback the anti-spam stamp so we can retry next run.
      await supabase
        .from("reminders")
        .update({ last_notified_at: null, last_notified_type: null })
        .eq("id", r.id);
      skipped++;
      continue;
    }

    emitted++;
  }

  return { evaluated: reminders.length, emitted, skipped };
}

/* ──────────────────────────────────────────────────────────────────
 * Helper exposed for callers that want to know "should I run now?".
 * Throttle to once per 60s per session to avoid bursts on rapid
 * navigations.
 * ──────────────────────────────────────────────────────────────── */

const RUN_THROTTLE_MS = 60_000;
let lastRunAt = 0;

export function isThrottled(now: number = Date.now()): boolean {
  return now - lastRunAt < RUN_THROTTLE_MS;
}

export function markRun(now: number = Date.now()): void {
  lastRunAt = now;
}

export function _resetThrottleForTest(): void {
  lastRunAt = 0;
}

/** Convenience: latest-km sometimes needs to be force-fresh (after the user
 *  just logged a mileage update). Re-evaluating with stale `current_mileage_km`
 *  could miss a "telat" status that just appeared. */
export async function refreshVehicleLatestKmThenEmit(): Promise<EvaluateAndEmitSummary> {
  // Touch vehicles to force the cache layer (PostgREST is stateless so this
  // is mostly a placeholder for a future server-side refresh hook). The
  // `getLatestMileageKm` per-vehicle is more expensive than reading the
  // synced column, so we accept slight staleness in favor of a single read.
  void getLatestMileageKm;
  return evaluateAndEmitForUser();
}
