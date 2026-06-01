/**
 * Quick-setup presets for the Reminder page.
 *
 * Each preset bundles the metadata the UI needs to (a) render a chip and
 * (b) derive sensible defaults (km/days interval + service_type) so the
 * user never has to type a number manually.
 *
 * Keep this list in sync with the DB CHECK constraint defined in
 * `supabase/migrations/002_reminder_presets.sql` — the slug strings must
 * match exactly, otherwise INSERTs will fail with a constraint violation.
 */

export type ReminderPresetSlug =
  | "oil_change"
  | "regular_service"
  | "cvt"
  | "brake"
  | "battery";

export interface ReminderPreset {
  slug: ReminderPresetSlug;
  /** Short human label used on chips & list cards. */
  label: string;
  /** Single-glyph icon, kept simple to avoid an icon library dependency. */
  icon: string;
  /**
   * Default km interval. `0` ⇒ this preset is time-driven only (e.g. Aki)
   * and the KM toggle should be disabled by default.
   */
  km: number;
  /**
   * Default day count, used as a hint for the "Sekali" schedule kind
   * (`once_at = today + days`). Repeat presets usually leave this at 0
   * because their cadence is captured by the schedule kind itself.
   */
  days: number;
  /** Maps to the existing `reminders.service_type` schema constraint. */
  service_type: "light" | "heavy";
  /** Whether the KM toggle should default to ON when this preset is picked. */
  defaultUseKm: boolean;
  /** Whether the schedule toggle should default to ON when picked. */
  defaultUseTime: boolean;
  /**
   * Default schedule kind to suggest when the schedule toggle is enabled.
   * `"monthly"` for service-style presets, `"once"` for one-shot presets
   * like "Ganti aki".
   */
  defaultScheduleKind: "once" | "daily" | "weekly" | "monthly";
}

export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  {
    slug: "oil_change",
    label: "Ganti oli",
    icon: "🛢️",
    km: 2500,
    days: 0,
    service_type: "light",
    defaultUseKm: true,
    defaultUseTime: false,
    defaultScheduleKind: "monthly",
  },
  {
    slug: "regular_service",
    label: "Servis rutin",
    icon: "🔧",
    km: 5000,
    days: 0,
    service_type: "heavy",
    defaultUseKm: true,
    defaultUseTime: false,
    defaultScheduleKind: "monthly",
  },
  {
    slug: "cvt",
    label: "CVT",
    icon: "⚙️",
    km: 10000,
    days: 0,
    service_type: "heavy",
    defaultUseKm: true,
    defaultUseTime: false,
    defaultScheduleKind: "monthly",
  },
  {
    slug: "brake",
    label: "Rem",
    icon: "🛑",
    km: 5000,
    days: 0,
    service_type: "light",
    defaultUseKm: true,
    defaultUseTime: false,
    defaultScheduleKind: "monthly",
  },
  {
    slug: "battery",
    label: "Aki",
    icon: "🔋",
    km: 0,
    days: 730,
    service_type: "light",
    defaultUseKm: false,
    defaultUseTime: true,
    defaultScheduleKind: "once",
  },
] as const;

export function getReminderPreset(
  slug: ReminderPresetSlug | string | null | undefined,
): ReminderPreset | undefined {
  if (!slug) return undefined;
  return REMINDER_PRESETS.find((p) => p.slug === slug);
}

/**
 * Pretty-print a day count using whatever unit feels most natural at first
 * glance ("2 tahun" beats "730 hari", "3 bulan" beats "90 hari").
 *
 * - Multiples of 365 → tahun
 * - Multiples of 30  → bulan
 * - Otherwise        → hari
 */
export function prettyDays(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "—";
  if (days % 365 === 0) {
    const y = days / 365;
    return `${y} tahun`;
  }
  if (days % 30 === 0) {
    const m = days / 30;
    return `${m} bulan`;
  }
  return `${days} hari`;
}
