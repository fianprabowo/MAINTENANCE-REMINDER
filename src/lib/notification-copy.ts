/**
 * Notification copywriting registry.
 *
 * Per the spec we want notifications that feel:
 *  - light & helpful (not nagging)
 *  - personalized when possible (vehicle name)
 *  - concrete with numbers ("300 km lagi" beats "segera habis")
 *  - graduated in urgency (mendekati = santai, terlewat = tegas)
 *
 * Variations are picked deterministically per (reminder, day) so a refresh
 * doesn't reshuffle the message — important for trust ("the notification I
 * dismissed and the one I see in the inbox should match"). The picker uses a
 * tiny string hash so we don't pull in any crypto / RNG dependency.
 *
 * Length budget (best practice for OS notifications + our inbox card):
 *   • title ≤ 40 chars
 *   • body  ≤ 80 chars
 *
 * ---------------------------------------------------------------------------
 * i18n:
 * ---------------------------------------------------------------------------
 * Semua string di-template via key locale (`notifications.copy.*`). Caller
 * pass `t` + `formatNumber` (dari `useTranslation()` di React tree) sehingga
 * copy ikut locale aktif user. Number formatting (mis. "12.500 km" vs
 * "12,500 km") juga locale-aware.
 *
 * Catatan design: notifikasi *stored* di DB dengan title+body plain string
 * pada saat pembuatan. Jadi kalau user ganti locale setelah notifikasi
 * dibuat, notifikasi lama tetap dalam bahasa asli. Ini mirror behavior
 * messaging apps normal (WhatsApp, dll) — konten immutable, bahasa fresh
 * hanya berlaku untuk konten baru.
 */

import type { ReminderPresetSlug } from "@/lib/reminder-presets";

/* ──────────────────────────────────────────────────────────────────
 * Inputs / outputs
 * ──────────────────────────────────────────────────────────────── */

export type NotificationCopyKind = "mendekati" | "terlewat";

export type CopyContext = {
  kind: NotificationCopyKind;
  presetSlug?: ReminderPresetSlug | string | null;
  /** Short label for the part being reminded — falls through to preset noun fallback jika tidak diset. */
  presetLabel?: string;
  /** Display name of the vehicle. Empty/undefined → omit personalization. */
  vehicleName?: string | null;
  /**
   * `remainingKm` & `remainingDays` express how close (positive) or how far
   * past (negative) the threshold we are. The picker chooses the most
   * informative variant available.
   */
  remainingKm?: number | null;
  remainingDays?: number | null;
  /**
   * Stable seed for variant selection. Use the reminder id + the bucket
   * date (yyyy-mm-dd) so variants change at most once per day, never within
   * a session.
   */
  seed?: string;
};

export type Copy = { title: string; body: string };

/**
 * Signature untuk translator function yang di-pass dari caller. Sengaja
 * loose (`string` key) supaya module ini tidak coupling ke `TranslationKey`
 * union type dari `@/lib/i18n`. Cast dilakukan di caller.
 */
export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/** Locale-aware number formatter. Signature identik dengan `useI18n().formatNumber`. */
export type NumberFormatFn = (
  n: number,
  opts?: Intl.NumberFormatOptions,
) => string;

/* ──────────────────────────────────────────────────────────────────
 * Helpers — internal utilities
 * ──────────────────────────────────────────────────────────────── */

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Truncate at the last whitespace before `max` so we don't break mid-word. */
function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice) + "…";
}

/**
 * djb2 string hash → bucket index in [0, mod). Stable, tiny, and free of
 * runtime randomness so a given (reminder, day) always picks the same line.
 */
function stableIndex(s: string, mod: number): number {
  if (mod <= 0) return 0;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

/**
 * Resolve preset slug → localized noun ("oil change" vs "ganti oli"). Kalau
 * slug tidak dikenali, fallback ke `presetLabel` (dari DB, biasanya
 * Indonesian) atau ke locale "fallback" key. Case: lowercase — caller
 * pakai `capitalizeFirst` kalau butuh capital di awal kalimat.
 */
function resolvePresetNoun(ctx: CopyContext, t: TranslateFn): string {
  const slug = (ctx.presetSlug ?? "").toString();
  const map: Record<string, string> = {
    oil_change: "notifications.copy.presetNouns.oilChange",
    regular_service: "notifications.copy.presetNouns.regularService",
    cvt: "notifications.copy.presetNouns.cvt",
    brake: "notifications.copy.presetNouns.brake",
    battery: "notifications.copy.presetNouns.battery",
  };
  const key = map[slug];
  if (key) return t(key);
  // Preset label dari DB — biasanya sudah dalam bahasa yang cocok, jadi
  // kita respect. Kalau kosong, fallback ke locale fallback.
  return ctx.presetLabel?.toLowerCase() ?? t("notifications.copy.presetNouns.fallback");
}

/* ──────────────────────────────────────────────────────────────────
 * Picker (main entry)
 * ──────────────────────────────────────────────────────────────── */

/**
 * Pilih title + body untuk notifikasi berdasarkan `ctx`. `t` +
 * `formatNumber` di-inject supaya module ini pure/testable (tidak
 * bergantung ke React context langsung).
 *
 * Pool titles (3 per kind) selalu ada — deterministic pick via seed hash.
 * Pool bodies bisa filter berdasarkan available data (mis. `mendekatiKm1`
 * skip kalau `remainingKm` undefined), lalu pick dari yang tersisa.
 */
export function pickCopy(
  ctx: CopyContext,
  t: TranslateFn,
  formatNumber: NumberFormatFn,
): Copy {
  // Precompute reusable substitution values ------------------------------
  const preset = resolvePresetNoun(ctx, t);
  const presetCap = capitalizeFirst(preset);

  const vehicleName = (ctx.vehicleName ?? "").trim();
  const hasVehicleName = vehicleName.length > 0;

  // Subject variants — dipakai di beberapa template.
  //  • `subject` (sentence-start or standalone): vehicle name OR "Motor kamu" / "Your bike"
  //  • `subjectLower` (mid-sentence): same but lowercase-safe untuk fallback
  //  • `subjectGeneric` (in mendekatiGeneric): vehicle name OR "motor" / "bike"
  //    (kurangi pronoun repetition "Siap-siap untuk servis motor kamu" → "…motor")
  const subjectLower = hasVehicleName
    ? vehicleName
    : t("notifications.copy.subject.fallbackLower");
  const subjectGeneric = hasVehicleName
    ? vehicleName
    : t("notifications.copy.subject.generic");

  const seed = ctx.seed ?? `${ctx.presetSlug ?? "?"}:${ctx.kind}`;

  // Title picker ---------------------------------------------------------
  const titleKeys: readonly string[] =
    ctx.kind === "mendekati"
      ? [
          "notifications.copy.titles.mendekati1",
          "notifications.copy.titles.mendekati2",
          "notifications.copy.titles.mendekati3",
        ]
      : [
          "notifications.copy.titles.terlewat1",
          "notifications.copy.titles.terlewat2",
          "notifications.copy.titles.terlewat3",
        ];
  const titleIdx = stableIndex(seed + ":t", titleKeys.length);
  const title = clamp(t(titleKeys[titleIdx] ?? titleKeys[0]), 40);

  // Body pool — factory functions supaya bisa filter berdasarkan data
  // availability sebelum pick.
  // ---------------------------------------------------------------------
  type BodyFn = () => string | null;
  const mendekatiPool: readonly BodyFn[] = [
    // KM-flavored variant 1 — starts with preset (capitalized).
    () => {
      if (typeof ctx.remainingKm !== "number" || ctx.remainingKm <= 0) return null;
      return t("notifications.copy.bodies.mendekatiKm1", {
        preset: presetCap,
        km: formatNumber(ctx.remainingKm),
      });
    },
    // KM-flavored variant 2 — inverted order, preset mid-sentence.
    () => {
      if (typeof ctx.remainingKm !== "number" || ctx.remainingKm <= 0) return null;
      return t("notifications.copy.bodies.mendekatiKm2", {
        km: formatNumber(ctx.remainingKm),
        preset,
      });
    },
    // Days-flavored.
    () => {
      if (typeof ctx.remainingDays !== "number" || ctx.remainingDays <= 0) return null;
      return t("notifications.copy.bodies.mendekatiDays", {
        preset: presetCap,
        days: ctx.remainingDays,
      });
    },
    // Personalized (only when vehicle name present).
    () => {
      if (!hasVehicleName) return null;
      return t("notifications.copy.bodies.mendekatiPersonal", {
        vehicle: vehicleName,
        preset,
      });
    },
    // Generic fallback — always usable.
    () =>
      t("notifications.copy.bodies.mendekatiGeneric", {
        preset,
        subject: subjectGeneric,
      }),
  ];

  const terlewatPool: readonly BodyFn[] = [
    // KM overdue — `remainingKm` is negative when overdue.
    () => {
      if (typeof ctx.remainingKm !== "number" || ctx.remainingKm >= 0) return null;
      return t("notifications.copy.bodies.terlewatKm", {
        preset: presetCap,
        km: formatNumber(Math.abs(ctx.remainingKm)),
      });
    },
    // Days overdue.
    () => {
      if (typeof ctx.remainingDays !== "number" || ctx.remainingDays >= 0) return null;
      return t("notifications.copy.bodies.terlewatDays", {
        preset: presetCap,
        days: Math.abs(ctx.remainingDays),
      });
    },
    // Personalized.
    () => {
      if (!hasVehicleName) return null;
      return t("notifications.copy.bodies.terlewatPersonal", {
        vehicle: vehicleName,
        preset,
      });
    },
    // Generic — always usable.
    () => t("notifications.copy.bodies.terlewatGeneric", { preset: presetCap }),
  ];

  const bodyPool = ctx.kind === "mendekati" ? mendekatiPool : terlewatPool;

  const candidates: string[] = [];
  for (const fn of bodyPool) {
    const out = fn();
    if (typeof out === "string" && out.length > 0) candidates.push(out);
  }
  const bodyIdx = candidates.length ? stableIndex(seed + ":b", candidates.length) : 0;
  const body = clamp(
    candidates[bodyIdx] ??
      t("notifications.copy.bodies.fallback", { subject: subjectLower }),
    80,
  );

  return { title, body };
}
