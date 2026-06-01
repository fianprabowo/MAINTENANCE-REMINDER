/**
 * Notification engine — pure logic for evaluating reminders and deciding
 * whether to emit a notification.
 *
 * Why a separate module? The decision tree (status thresholds, anti-spam
 * rules, hybrid km/time picking) is non-trivial and we want it to be:
 *   - **Side-effect free** so tests don't need a DB.
 *   - **Reusable** by both the client runner (in-app) and a future
 *     server-side cron (Edge Function for Web Push).
 *
 * Status thresholds (hybrid, per product confirmation):
 *   • `mendekati` ⇐ percent_remaining ≤ 30% OR remaining_km ≤ 100km OR remaining_days ≤ 14
 *   • `terlewat`  ⇐ remaining ≤ 0 (km or days)
 *   • `aman`      ⇐ otherwise
 *
 * Anti-spam (per spec):
 *   • Max 1 notification per reminder per day (calendar day, not 24h window).
 *   • `mendekati` fires once per cycle. After it fires, we don't fire again
 *     until the reminder is reset (e.g. user logs the matching service) OR
 *     the status escalates to `terlewat`.
 *   • `terlewat` fires immediately, then re-fires every 3 days while still
 *     overdue.
 */

import { computeNextOccurrence, buildScheduleSpec } from "@/lib/reminder-schedule";
import type { Reminder } from "@/lib/types";

/* ──────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────── */

export type EvaluatedStatus = "aman" | "mendekati" | "terlewat";
export type NotifyType = "mendekati" | "terlewat";

export type Evaluation = {
  status: EvaluatedStatus;
  /** 0..100. Null when neither km nor time interval is configured. */
  percentRemaining: number | null;
  /** Negative when overdue. Null when no km interval. */
  remainingKm: number | null;
  /** Negative when overdue. Null when no time schedule. */
  remainingDays: number | null;
  /** Which dimension drives the status (the more critical of km vs time). */
  driver: "km" | "time" | null;
};

export type EmitDecision = {
  /** Should we create a notification right now? */
  shouldEmit: boolean;
  /** Which kind to emit (only meaningful when `shouldEmit` is true). */
  notifyType: NotifyType | null;
  /** Human-readable explanation for debugging / dev tools. */
  reason: string;
};

/* ──────────────────────────────────────────────────────────────────
 * Threshold constants (per spec)
 * ──────────────────────────────────────────────────────────────── */

const PCT_MENDEKATI_MAX = 30; // %
const ABS_KM_BUFFER = 100; // km
const ABS_DAYS_BUFFER = 14; // days
const TERLEWAT_REPEAT_DAYS = 3; // re-fire interval while overdue

/* ──────────────────────────────────────────────────────────────────
 * Evaluation
 * ──────────────────────────────────────────────────────────────── */

/**
 * Compute the live state of a reminder. Pure function — caller passes the
 * snapshot (`currentKm`, `now`) explicitly so the result is reproducible.
 *
 * Hybrid rule: when both km and time intervals are configured, we pick the
 * dimension with the smaller percentRemaining (i.e. whichever will hit
 * zero first). This matches `formatRemaining` semantics in
 * `part-condition-utils.ts`.
 */
export function evaluateReminder(
  r: Reminder,
  currentKm: number,
  now: Date = new Date(),
): Evaluation {
  // ── KM dimension ───────────────────────────────────────────────
  let pctKm: number | null = null;
  let remKm: number | null = null;
  if (r.km_interval > 0 && r.next_due_km > 0) {
    remKm = r.next_due_km - currentKm;
    // % remaining = used / total inverted, clamped on display side.
    const used = Math.max(0, currentKm - r.last_service_km);
    pctKm = clampPct(100 * (1 - used / r.km_interval));
  }

  // ── Time dimension ────────────────────────────────────────────
  // Prefer the live next-occurrence (handles weekly/monthly correctly);
  // fall back to the snapshot `next_due_date` for legacy rows.
  const spec = buildScheduleSpec(r);
  const next = spec ? computeNextOccurrence(spec, now) : null;
  const nextDate = next ?? (r.next_due_date ? new Date(r.next_due_date) : null);

  let pctTime: number | null = null;
  let remDays: number | null = null;
  if (nextDate && !Number.isNaN(nextDate.getTime())) {
    const ms = nextDate.getTime() - now.getTime();
    remDays = Math.ceil(ms / (1000 * 60 * 60 * 24));
    // For percent we need a known interval. Prefer `date_interval_days`,
    // else derive from last_service_date → nextDate span.
    let intervalDays = r.date_interval_days > 0 ? r.date_interval_days : 0;
    if (intervalDays === 0 && r.last_service_date) {
      const last = new Date(r.last_service_date + "T12:00:00");
      if (!Number.isNaN(last.getTime())) {
        intervalDays = Math.max(
          1,
          Math.round((nextDate.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)),
        );
      }
    }
    if (intervalDays > 0) {
      const usedDays = Math.max(0, intervalDays - remDays);
      pctTime = clampPct(100 * (1 - usedDays / intervalDays));
    }
  }

  // ── Pick driver (most critical) + derive status ───────────────
  let driver: Evaluation["driver"] = null;
  let percent: number | null = null;
  if (pctKm == null && pctTime == null) {
    // Nothing configured → can't evaluate. Caller should treat as "aman".
    return { status: "aman", percentRemaining: null, remainingKm: remKm, remainingDays: remDays, driver: null };
  }
  if (pctKm == null) {
    driver = "time";
    percent = pctTime;
  } else if (pctTime == null) {
    driver = "km";
    percent = pctKm;
  } else if (pctKm <= pctTime) {
    driver = "km";
    percent = pctKm;
  } else {
    driver = "time";
    percent = pctTime;
  }

  const status = deriveStatus({
    percent,
    remainingKm: remKm,
    remainingDays: remDays,
  });

  return { status, percentRemaining: percent, remainingKm: remKm, remainingDays: remDays, driver };
}

function deriveStatus(args: {
  percent: number | null;
  remainingKm: number | null;
  remainingDays: number | null;
}): EvaluatedStatus {
  // Terlewat wins as soon as ANY dimension goes ≤ 0.
  if (
    (args.remainingKm != null && args.remainingKm <= 0) ||
    (args.remainingDays != null && args.remainingDays <= 0)
  ) {
    return "terlewat";
  }
  // Mendekati: percent threshold OR absolute buffer (whichever is hit first).
  const pctHit = args.percent != null && args.percent <= PCT_MENDEKATI_MAX;
  const kmHit = args.remainingKm != null && args.remainingKm <= ABS_KM_BUFFER;
  const dayHit = args.remainingDays != null && args.remainingDays <= ABS_DAYS_BUFFER;
  if (pctHit || kmHit || dayHit) return "mendekati";
  return "aman";
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* ──────────────────────────────────────────────────────────────────
 * Anti-spam decision
 * ──────────────────────────────────────────────────────────────── */

/**
 * Decide whether to emit a notification for this reminder right now.
 *
 * The rules below are deliberately conservative — when in doubt, DON'T
 * notify. A missed beat is recoverable; a spam wave is not.
 */
export function decideEmit(
  r: Reminder,
  evaluation: Evaluation,
  now: Date = new Date(),
): EmitDecision {
  // Aman → never emit.
  if (evaluation.status === "aman") {
    return { shouldEmit: false, notifyType: null, reason: "status=aman" };
  }

  const lastNotifiedAt = r.last_notified_at ? new Date(r.last_notified_at) : null;
  const lastType = r.last_notified_type ?? null;

  // Cap: at most 1 notification per calendar day per reminder. Compare
  // by yyyy-mm-dd in the user's local TZ; we do this at the JS layer because
  // the engine runs client-side (server-side cron will need to repeat this
  // check using the user's TZ).
  if (lastNotifiedAt && sameLocalDay(lastNotifiedAt, now)) {
    return { shouldEmit: false, notifyType: null, reason: "already_notified_today" };
  }

  if (evaluation.status === "mendekati") {
    // Fire at most once per cycle. If we've already fired `mendekati` and
    // status is still mendekati (no escalation), stay quiet.
    if (lastType === "mendekati") {
      return { shouldEmit: false, notifyType: null, reason: "mendekati_already_fired" };
    }
    // If we've already fired `terlewat` and now we're at `mendekati`, that
    // means the user reset / serviced — we shouldn't emit again until the
    // next cycle. (last_notified_* is cleared on reset, so this branch
    // only triggers if the reset path wasn't run for some reason.)
    if (lastType === "terlewat") {
      return { shouldEmit: false, notifyType: null, reason: "downgraded_after_terlewat" };
    }
    return { shouldEmit: true, notifyType: "mendekati", reason: "first_mendekati" };
  }

  // status === "terlewat"
  if (lastType !== "terlewat") {
    // Escalation from any prior state (or none) — fire immediately.
    return { shouldEmit: true, notifyType: "terlewat", reason: "first_terlewat" };
  }
  // Already fired terlewat at least once. Re-fire every 3 days.
  if (!lastNotifiedAt) {
    return { shouldEmit: true, notifyType: "terlewat", reason: "missing_last_notified_at" };
  }
  const daysSince = Math.floor(
    (now.getTime() - lastNotifiedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysSince >= TERLEWAT_REPEAT_DAYS) {
    return { shouldEmit: true, notifyType: "terlewat", reason: `repeat_after_${daysSince}d` };
  }
  return { shouldEmit: false, notifyType: null, reason: `terlewat_cooldown_${daysSince}d` };
}

/** True if both timestamps fall on the same calendar day in local time. */
function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Day-bucket helper for copy seed (exposed so callers don't reinvent)
 * ──────────────────────────────────────────────────────────────── */

export function dayBucket(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
