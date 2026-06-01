/**
 * Schedule definitions for reminders (see migration 003).
 *
 * Four kinds, each with its own auxiliary field:
 *   - "once"    → trigger once at `once_at`
 *   - "daily"   → trigger every day
 *   - "weekly"  → trigger on `weekdays` (0=Sunday … 6=Saturday)
 *   - "monthly" → trigger on `day_of_month` (1..31, clamped to month length)
 *
 * The DB enforces "exactly one auxiliary field per kind" via
 * `reminders_schedule_consistency_check`. This file mirrors that contract
 * with a discriminated union and a couple of helpers.
 */

export type ScheduleKind = "once" | "daily" | "weekly" | "monthly";

export type ScheduleSpec =
  | { kind: "once"; once_at: string }
  | { kind: "daily" }
  | { kind: "weekly"; weekdays: number[] }
  | { kind: "monthly"; day_of_month: number };

/**
 * Display order is Mon→Sun (Indonesian convention) even though the stored
 * value follows JS's `Date.getDay()` numbering (Sunday=0). Render code reads
 * this list top-to-bottom; storage stays raw.
 */
export const WEEKDAYS: readonly { value: number; short: string; long: string }[] = [
  { value: 1, short: "Sen", long: "Senin" },
  { value: 2, short: "Sel", long: "Selasa" },
  { value: 3, short: "Rab", long: "Rabu" },
  { value: 4, short: "Kam", long: "Kamis" },
  { value: 5, short: "Jum", long: "Jumat" },
  { value: 6, short: "Sab", long: "Sabtu" },
  { value: 0, short: "Min", long: "Minggu" },
] as const;

export const DEFAULT_TRIGGER_HOUR = 9;

/* ──────────────────────────────────────────────────────────────────
 * Pure helpers
 * ──────────────────────────────────────────────────────────────── */

export function sortWeekdaysForDisplay(days: number[]): number[] {
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * Return the next future occurrence of `spec` after `from` (default: now).
 * Returns `null` if the schedule has no resolvable next time (e.g. weekly
 * with empty weekday list, or once_at in the past for a 'once' kind).
 *
 * Notes:
 *  - Daily / weekly / monthly are anchored at 09:00 local time so the
 *    "next due" reads naturally ("besok 09:00" rather than midnight).
 *  - Monthly clamps `day_of_month` to the month's last day when the chosen
 *    day doesn't exist (e.g. 31 in February → Feb 28/29).
 */
export function computeNextOccurrence(
  spec: ScheduleSpec,
  from: Date = new Date(),
): Date | null {
  switch (spec.kind) {
    case "once": {
      const d = new Date(spec.once_at);
      if (Number.isNaN(d.getTime())) return null;
      // For 'once', returning a past date is fine — caller renders that as
      // "Lewat X hari". This matches the historical behaviour of `next_due_date`.
      return d;
    }

    case "daily": {
      const next = new Date(from);
      next.setHours(DEFAULT_TRIGGER_HOUR, 0, 0, 0);
      if (next <= from) next.setDate(next.getDate() + 1);
      return next;
    }

    case "weekly": {
      const days = spec.weekdays;
      if (!days || days.length === 0) return null;
      // Look up to 7 days ahead (inclusive of "today if not yet 09:00").
      for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(from);
        candidate.setDate(candidate.getDate() + offset);
        candidate.setHours(DEFAULT_TRIGGER_HOUR, 0, 0, 0);
        if (candidate <= from) continue;
        if (days.includes(candidate.getDay())) return candidate;
      }
      return null;
    }

    case "monthly": {
      const dom = spec.day_of_month;
      if (!dom || dom < 1 || dom > 31) return null;
      const candidate = clampMonthDay(from.getFullYear(), from.getMonth(), dom);
      candidate.setHours(DEFAULT_TRIGGER_HOUR, 0, 0, 0);
      if (candidate > from) return candidate;
      return clampMonthDay(from.getFullYear(), from.getMonth() + 1, dom, DEFAULT_TRIGGER_HOUR);
    }
  }
}

function clampMonthDay(year: number, month: number, day: number, hour = 0): Date {
  // Build a date at the 1st first, find the last day of that month, then
  // clamp to it. Using setDate(0) on the *next* month gives last-day-of-this.
  const lastDay = new Date(year, month + 1, 0).getDate();
  const safe = Math.min(day, lastDay);
  return new Date(year, month, safe, hour, 0, 0, 0);
}

/* ──────────────────────────────────────────────────────────────────
 * Display helpers
 * ──────────────────────────────────────────────────────────────── */

const ID_DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};

/**
 * Human-readable description of a schedule. Used both for the form preview
 * and as a fallback subtitle on list cards.
 *
 * Returns short fragments like "setiap Senin, Rabu" — suitable for joining
 * with a km clause via " + " / "atau".
 */
export function formatScheduleSummary(spec: ScheduleSpec | null): string {
  if (!spec) return "";

  switch (spec.kind) {
    case "once": {
      const d = new Date(spec.once_at);
      if (Number.isNaN(d.getTime())) return "Pilih tanggal";
      return `Pada ${d.toLocaleDateString("id-ID", ID_DATE_FMT)}`;
    }

    case "daily":
      return "setiap hari";

    case "weekly": {
      const sorted = sortWeekdaysForDisplay(spec.weekdays);
      if (sorted.length === 0) return "Pilih hari";
      const labels = sorted
        .map((d) => WEEKDAYS.find((w) => w.value === d)?.long)
        .filter(Boolean);
      return `setiap ${labels.join(", ")}`;
    }

    case "monthly":
      if (!spec.day_of_month) return "Pilih tanggal bulan";
      return `setiap tanggal ${spec.day_of_month}`;
  }
}

/**
 * Reconstruct a `ScheduleSpec` from raw DB columns. Returns `null` when
 * `schedule_kind` is not set (legacy row), so callers can fall back to the
 * older `date_interval_days` / `next_due_date` shape.
 */
export function buildScheduleSpec(row: {
  schedule_kind?: string | null;
  schedule_once_at?: string | null;
  schedule_weekdays?: number[] | null;
  schedule_day_of_month?: number | null;
}): ScheduleSpec | null {
  const kind = row.schedule_kind as ScheduleKind | null | undefined;
  if (!kind) return null;
  switch (kind) {
    case "once":
      if (!row.schedule_once_at) return null;
      return { kind: "once", once_at: row.schedule_once_at };
    case "daily":
      return { kind: "daily" };
    case "weekly":
      if (!row.schedule_weekdays || row.schedule_weekdays.length === 0) return null;
      return { kind: "weekly", weekdays: row.schedule_weekdays };
    case "monthly":
      if (!row.schedule_day_of_month) return null;
      return { kind: "monthly", day_of_month: row.schedule_day_of_month };
    default:
      return null;
  }
}
