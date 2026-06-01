/**
 * Auto-reset reminders after a matching service record.
 *
 * When the user logs a service that includes (e.g.) an engine oil change,
 * the corresponding `oil_change` reminder for that vehicle should reset to
 * a fresh cycle: snapshot the previous state (for Undo) and recompute
 * `last_service_km`, `next_due_km`, `next_due_date`, plus clear the
 * notification anti-spam stamps.
 *
 * Why a separate file? Keeps `reminders.ts` and `serviceRecords.ts` from
 * importing each other (cycle risk). This module depends on both.
 */

import { supabase } from "../client";
import { mapReminder, mapReminderReset } from "../mappers";
import { requireUser } from "../auth-helpers";
import { computeNextOccurrence, buildScheduleSpec } from "@/lib/reminder-schedule";
import {
  isEngineOilRecord,
  isGearboxOilRecord,
} from "@/lib/oil-utils";
import type {
  Reminder,
  ReminderResetSnapshot,
  ServiceRecord,
} from "@/lib/types";

/* ──────────────────────────────────────────────────────────────────
 * Preset matching
 * ──────────────────────────────────────────────────────────────── */

/**
 * Decide which preset slugs the given service record should reset.
 *
 * Rules (mirrors UX expectations — "I just did this servicing, so the
 * reminder for it should restart from now"):
 *   • changed_engine_oil OR isOilChangeRecord → oil_change
 *   • parts include `roller_cvt` / `v_belt` / `kampas_ganda` → cvt
 *   • parts include `brake_pad`               → brake
 *   • parts include `battery`                 → battery
 *   • service_type === 'heavy'                → regular_service
 *
 * Note: gearbox-only service does NOT auto-reset oil_change because the
 * "Ganti oli" preset specifically tracks engine oil cadence.
 */
export function presetSlugsToResetForServiceRecord(r: ServiceRecord): Set<string> {
  const out = new Set<string>();
  if (isEngineOilRecord(r) || isGearboxOilRecord(r)) {
    if (isEngineOilRecord(r)) out.add("oil_change");
  }
  if (r.service_type === "heavy") out.add("regular_service");

  for (const part of r.parts) {
    const slug = part.kind_slug;
    if (!slug) continue;
    if (slug === "roller_cvt" || slug === "v_belt" || slug === "kampas_ganda") {
      out.add("cvt");
    } else if (slug === "brake_pad") {
      out.add("brake");
    } else if (slug === "battery") {
      out.add("battery");
    }
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────
 * Apply / Undo
 * ──────────────────────────────────────────────────────────────── */

export type ResetResult = {
  reminder: Reminder;
  snapshotId: string;
};

/**
 * Reset all reminders for `vehicleId` whose preset matches the slugs that
 * `record` indicates. For each match:
 *   1. Insert a `reminder_resets` snapshot of the pre-reset state.
 *   2. Update the reminder: shift `last_service_km` to the record's mileage,
 *      `last_service_date` to the record's date, recompute `next_due_km`
 *      using the existing `km_interval`, and recompute `next_due_date` from
 *      the schedule definition (if any). Clear notification stamps.
 *
 * Returns the list of reset reminders + their snapshot ids so the caller
 * can surface a single toast like:
 *   "2 reminder direset · Undo"
 *
 * Errors are non-fatal — reset is best-effort. The caller already has a
 * confirmed service record, and a missed reminder reset can always be
 * fixed manually. We log to console for diagnosability.
 */
export async function resetRemindersAfterServiceRecord(
  vehicleId: string,
  record: ServiceRecord,
): Promise<ResetResult[]> {
  const slugs = presetSlugsToResetForServiceRecord(record);
  if (slugs.size === 0) return [];

  const user = await requireUser();

  const { data: reminderRows, error: fetchErr } = await supabase
    .from("reminders")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .in("preset_slug", Array.from(slugs));
  if (fetchErr) {
    console.warn("[reminderReset] fetch failed", fetchErr.message);
    return [];
  }
  const reminders: Reminder[] = (reminderRows ?? []).map((row) =>
    mapReminder(row as Parameters<typeof mapReminder>[0]),
  );
  if (reminders.length === 0) return [];

  const results: ResetResult[] = [];

  for (const r of reminders) {
    // Compute the new state.
    const newLastKm = record.mileage_at_service;
    const newLastDate = record.serviced_at;
    const newNextDueKm = r.km_interval > 0 ? newLastKm + r.km_interval : 0;

    let newNextDueDate: string | null = null;
    const spec = buildScheduleSpec(r);
    if (spec) {
      // Anchor the recomputation at the day after the service so a
      // monthly/weekly schedule doesn't immediately fire on the same day.
      const anchor = new Date(newLastDate + "T12:00:00");
      anchor.setDate(anchor.getDate() + 1);
      const next = computeNextOccurrence(spec, anchor);
      newNextDueDate = next ? next.toISOString() : null;
    }

    // Snapshot first (so Undo works even if the update partially fails).
    const snapshotPayload = {
      reminder_id: r.id,
      user_id: user.id,
      service_record_id: record.id,
      snapshot: {
        km_interval: r.km_interval,
        last_service_km: r.last_service_km,
        last_service_date: r.last_service_date ?? null,
        next_due_km: r.next_due_km,
        next_due_date: r.next_due_date ?? null,
        last_notified_at: r.last_notified_at ?? null,
        last_notified_type: r.last_notified_type ?? null,
      },
    };
    const { data: snapRow, error: snapErr } = await supabase
      .from("reminder_resets")
      .insert(snapshotPayload)
      .select()
      .single();
    if (snapErr || !snapRow) {
      console.warn("[reminderReset] snapshot insert failed", snapErr?.message);
      continue;
    }
    const snapshot = mapReminderReset(snapRow as Parameters<typeof mapReminderReset>[0]);

    // Apply the reset.
    const { data: updatedRow, error: updErr } = await supabase
      .from("reminders")
      .update({
        last_service_km: newLastKm,
        last_service_date: newLastDate,
        next_due_km: newNextDueKm,
        next_due_date: newNextDueDate,
        last_notified_at: null,
        last_notified_type: null,
      })
      .eq("id", r.id)
      .select()
      .single();
    if (updErr || !updatedRow) {
      console.warn("[reminderReset] reset update failed", updErr?.message);
      // Best-effort cleanup: drop the orphan snapshot so it doesn't show
      // up in some future "history of resets" view.
      await supabase.from("reminder_resets").delete().eq("id", snapshot.id);
      continue;
    }

    results.push({
      reminder: mapReminder(updatedRow as Parameters<typeof mapReminder>[0]),
      snapshotId: snapshot.id,
    });
  }

  return results;
}

/**
 * Undo a previously applied reset by restoring the snapshot. Snapshots are
 * single-use — we delete the row after successful restore so the same
 * "Undo" can't double-fire.
 *
 * Returns the restored reminder, or null if the snapshot was missing /
 * already consumed.
 */
export async function restoreReminderFromReset(
  snapshotId: string,
): Promise<Reminder | null> {
  const { data: snapRow, error: snapErr } = await supabase
    .from("reminder_resets")
    .select("*")
    .eq("id", snapshotId)
    .maybeSingle();
  if (snapErr) throw new Error(snapErr.message);
  if (!snapRow) return null;

  const snapshot: ReminderResetSnapshot = mapReminderReset(
    snapRow as Parameters<typeof mapReminderReset>[0],
  );

  const { data: updatedRow, error: updErr } = await supabase
    .from("reminders")
    .update({
      // We restore the cycle anchors. `km_interval` doesn't change on
      // reset (the reset only shifts the cycle), so we don't need to put
      // it back — but we include it defensively in case the row was
      // edited between reset and undo.
      km_interval: snapshot.snapshot.km_interval,
      last_service_km: snapshot.snapshot.last_service_km,
      last_service_date: snapshot.snapshot.last_service_date,
      next_due_km: snapshot.snapshot.next_due_km,
      next_due_date: snapshot.snapshot.next_due_date,
      last_notified_at: snapshot.snapshot.last_notified_at,
      last_notified_type: snapshot.snapshot.last_notified_type,
    })
    .eq("id", snapshot.reminder_id)
    .select()
    .single();
  if (updErr) throw new Error(updErr.message);
  if (!updatedRow) return null;

  // One-shot: consume the snapshot.
  await supabase.from("reminder_resets").delete().eq("id", snapshot.id);

  return mapReminder(updatedRow as Parameters<typeof mapReminder>[0]);
}
