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
 * Sanity check via runtime assertion is intentionally left out — keep this
 * file dependency-free. The variations below are hand-checked.
 */

import type { ReminderPresetSlug } from "@/lib/reminder-presets";

/* ──────────────────────────────────────────────────────────────────
 * Inputs / outputs
 * ──────────────────────────────────────────────────────────────── */

export type NotificationCopyKind = "mendekati" | "terlewat";

export type CopyContext = {
  kind: NotificationCopyKind;
  presetSlug?: ReminderPresetSlug | string | null;
  /** Short label for the part being reminded — falls through to "servis" if unset. */
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

/* ──────────────────────────────────────────────────────────────────
 * Title pools
 *
 * Title is short, focused on intent. Personalization happens in the body
 * because vehicle names can be long enough to blow the 40-char budget.
 * ──────────────────────────────────────────────────────────────── */

const TITLES: Record<NotificationCopyKind, readonly string[]> = {
  mendekati: ["Servis sebentar lagi", "Hampir waktunya servis", "Bersiap untuk servis"],
  terlewat: ["Sudah waktunya servis", "Servis sudah lewat", "Motor butuh perhatian"],
};

/* ──────────────────────────────────────────────────────────────────
 * Body templates
 *
 * Templates are factory functions so we can interpolate numbers cleanly
 * AND skip variants that don't apply (e.g. "X km lagi" when only `days` is
 * available). The picker filters out null returns before randomizing.
 * ──────────────────────────────────────────────────────────────── */

type BodyFactory = (ctx: CopyContext) => string | null;

function withSubject(ctx: CopyContext): string {
  // "Scoopy" > "Motor kamu" > generic "Servis"
  const v = (ctx.vehicleName ?? "").trim();
  return v.length > 0 ? v : "Motor kamu";
}

function presetNoun(ctx: CopyContext): string {
  // Used as the "thing" in body text. Fallback "servis rutin" sounds
  // natural when slug is unknown.
  const slug = ctx.presetSlug ?? "";
  if (slug === "oil_change") return "ganti oli";
  if (slug === "regular_service") return "servis rutin";
  if (slug === "cvt") return "servis CVT";
  if (slug === "brake") return "ganti kampas rem";
  if (slug === "battery") return "ganti aki";
  return ctx.presetLabel?.toLowerCase() ?? "servis";
}

const MENDEKATI_BODIES: readonly BodyFactory[] = [
  // KM-flavored (only when remainingKm > 0)
  (c) => {
    if (typeof c.remainingKm !== "number" || c.remainingKm <= 0) return null;
    const noun = presetNoun(c);
    return `${capitalizeFirst(noun)} sekitar ${c.remainingKm.toLocaleString("id-ID")} km lagi`;
  },
  (c) => {
    if (typeof c.remainingKm !== "number" || c.remainingKm <= 0) return null;
    return `Tinggal ${c.remainingKm.toLocaleString("id-ID")} km lagi sebelum ${presetNoun(c)}`;
  },
  // Days-flavored
  (c) => {
    if (typeof c.remainingDays !== "number" || c.remainingDays <= 0) return null;
    return `${capitalizeFirst(presetNoun(c))} dijadwalkan ${c.remainingDays} hari lagi`;
  },
  // Personalized (only when vehicleName present)
  (c) => {
    const v = (c.vehicleName ?? "").trim();
    if (!v) return null;
    return `${v} hampir waktunya ${presetNoun(c)}`;
  },
  // Generic fallback (always usable)
  (c) => `Siap-siap untuk ${presetNoun(c)} ${withSubject(c).toLowerCase() === "motor kamu" ? "motor" : withSubject(c)}`,
];

const TERLEWAT_BODIES: readonly BodyFactory[] = [
  (c) => {
    // remainingKm is negative when overdue
    if (typeof c.remainingKm !== "number" || c.remainingKm >= 0) return null;
    const past = Math.abs(c.remainingKm);
    return `${capitalizeFirst(presetNoun(c))} sudah lewat ${past.toLocaleString("id-ID")} km`;
  },
  (c) => {
    if (typeof c.remainingDays !== "number" || c.remainingDays >= 0) return null;
    const past = Math.abs(c.remainingDays);
    return `${capitalizeFirst(presetNoun(c))} terlewat ${past} hari`;
  },
  (c) => {
    const v = (c.vehicleName ?? "").trim();
    if (!v) return null;
    return `${v} sudah waktunya ${presetNoun(c)}`;
  },
  (c) => `${capitalizeFirst(presetNoun(c))} sudah lewat — sebaiknya segera dijadwalkan`,
];

/* ──────────────────────────────────────────────────────────────────
 * Picker
 * ──────────────────────────────────────────────────────────────── */

export function pickCopy(ctx: CopyContext): Copy {
  const titles = TITLES[ctx.kind];
  const bodyPool = ctx.kind === "mendekati" ? MENDEKATI_BODIES : TERLEWAT_BODIES;

  const seed = ctx.seed ?? `${ctx.presetSlug ?? "?"}:${ctx.kind}`;
  const titleIdx = stableIndex(seed + ":t", titles.length);
  const title = clamp(titles[titleIdx] ?? titles[0], 40);

  // Filter out templates that returned null (lacked data they needed),
  // then pick a stable variant. If everything filters out (shouldn't —
  // last entry of each pool is always usable), fall back to a static line.
  const candidates: string[] = [];
  for (const fn of bodyPool) {
    const out = fn(ctx);
    if (typeof out === "string" && out.length > 0) candidates.push(out);
  }
  const bodyIdx = candidates.length ? stableIndex(seed + ":b", candidates.length) : 0;
  const body = clamp(
    candidates[bodyIdx] ?? `Yuk cek ${withSubject(ctx).toLowerCase()} sekarang`,
    80,
  );

  return { title, body };
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
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
