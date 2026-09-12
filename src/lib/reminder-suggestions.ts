/**
 * Reminder threshold suggestions ("By system" mode).
 *
 * The reminder form lets the user pick between "Otomatis" (computed from
 * actual maintenance history) and "Manual" (free-form input). This module
 * implements the "Otomatis" calculation as **pure functions** so they're
 * trivial to unit-test and reusable from any caller.
 *
 * Design decisions (locked in via product confirmation):
 *
 *  - Snapshot, not dynamic. Compute once at the moment the user submits;
 *    the resulting target_km / schedule date is frozen on the row. This
 *    keeps the DB simple (no trigger gymnastics) and makes the reminder
 *    behavior predictable for the user.
 *
 *  - Smart scope. Only presets that have a real "kondisi" data source get
 *    auto-mode. `regular_service` has no part-specific tracking so we
 *    return `available: false` and the UI hides the auto/manual toggle.
 *
 *  - Graceful fallback. If the relevant history is missing (user just
 *    started tracking), we still produce a value via `currentKm + preset.km`
 *    (or `today + preset.days` for time) and tag the source as `"fallback"`
 *    so the UI can show a small note ("Belum ada riwayat — pakai estimasi
 *    dari KM saat ini").
 */

import type { MotorcycleCategory, ServiceRecord } from "@/lib/types";
import {
  pickLatestEngineOil,
  intervalMidKm,
  engineIntervalMid,
} from "@/lib/oil-utils";
import { pickLatestChangeBySlug } from "@/lib/part-condition-utils";
import { PART_KIND_BY_SLUG } from "@/lib/part-kinds";
import type { ReminderPreset, ReminderPresetSlug } from "@/lib/reminder-presets";
import type { TranslationKey } from "@/lib/i18n";

/* ──────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────── */

export type SuggestionSource = "history" | "fallback" | "none";

/**
 * Structured note yang caller render via `t()`. `key` menunjuk ke locale
 * entry, `vars` berisi *raw* values — angka di-format otomatis oleh
 * `t()` di `interpolate` (Intl.NumberFormat pakai locale aktif). Ini
 * memastikan pengguna EN lihat "12,500 km" dan ID lihat "12.500 km"
 * tanpa suggestion function perlu tahu locale.
 *
 * Kalau ada `partKey`, caller wajib translate dulu (`t(partKey)`) lalu isi
 * ke `vars.part` sebelum panggil `t(key, vars)`. Ini karena `computeXxx`
 * adalah pure fn (bukan React), tidak punya akses ke `t()`.
 *
 * Legacy `note: string` (Bahasa Indonesia) tetap ada untuk backward compat.
 */
export type SuggestionNote = {
  key: TranslationKey | null;
  vars: Record<string, string | number>;
  /** Optional i18n key untuk nama part — resolve di caller. */
  partKey?: TranslationKey;
};

export type KmSuggestion = {
  /** False ⇒ this preset has no auto-mode at all (e.g. regular_service). */
  available: boolean;
  source: SuggestionSource;
  /** Suggested absolute target KM. `null` only when `available === false`. */
  km: number | null;
  /** Human-readable "why this number". Empty string when `available === false`. */
  note: string;
  /** i18n-aware version of `note`. UI React sebaiknya baca ini + `t()`. */
  noteI18n: SuggestionNote;
};

export type TimeSuggestion = {
  available: boolean;
  source: SuggestionSource;
  /** Suggested ISO datetime for a one-shot schedule. `null` if N/A. */
  iso: string | null;
  /** Days from today encoded into the suggestion (for hint text). `null` if N/A. */
  daysAhead: number | null;
  note: string;
  noteI18n: SuggestionNote;
};

/** Konvenien empty note. */
const EMPTY_NOTE: SuggestionNote = { key: null, vars: {} };

export type SuggestionInputs = {
  preset: ReminderPreset;
  currentKm: number;
  /** May be null while the page is still loading; treat as "no data" then. */
  category: MotorcycleCategory | null;
  /** Recent service records (sorted DESC by serviced_at). */
  records: readonly ServiceRecord[];
  /** Override "today" for testability. */
  now?: Date;
};

/* ──────────────────────────────────────────────────────────────────
 * Internal helpers
 * ──────────────────────────────────────────────────────────────── */

/**
 * Per-preset mapping to the `part-kinds` slug we use for tracking. CVT and
 * Brake are derived from the most recent record matching ANY of the listed
 * slugs (CVT lifecycle = roller / belt / kampas — whichever was most
 * recently changed counts as the cycle restart).
 */
const KM_PART_SLUGS: Partial<Record<ReminderPresetSlug, readonly string[]>> = {
  cvt: ["roller_cvt", "v_belt", "kampas_ganda"],
  brake: ["brake_pad"],
};

/** Add `days` to `now` and return as ISO string at 09:00 local (matches form
 *  default). Avoids timezone surprises by going through Date arithmetic. */
function isoDaysAhead(days: number, now: Date): string {
  const t = new Date(now);
  t.setDate(t.getDate() + Math.max(0, days));
  t.setHours(9, 0, 0, 0);
  return t.toISOString();
}

function daysBetween(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/* ──────────────────────────────────────────────────────────────────
 * KM suggestion
 * ──────────────────────────────────────────────────────────────── */

export function computeKmSuggestion({
  preset,
  currentKm,
  category,
  records,
}: SuggestionInputs): KmSuggestion {
  // Time-only preset — no KM auto-mode at all.
  if (preset.km <= 0) {
    return { available: false, source: "none", km: null, note: "", noteI18n: EMPTY_NOTE };
  }

  // Generic / non-tracked preset — keep auto OFF so the UI shows Manual only.
  // (regular_service is intentionally absent from KM_PART_SLUGS and isn't
  // oil_change.)
  if (preset.slug !== "oil_change" && !KM_PART_SLUGS[preset.slug]) {
    return { available: false, source: "none", km: null, note: "", noteI18n: EMPTY_NOTE };
  }

  // ── oil_change: prefer category interval (real per-merk data) ─────
  //
  // `noteI18n.vars` pakai *raw numbers* — `t()` auto-format via
  // Intl.NumberFormat berdasarkan locale user (id/en). `note` (legacy
  // string) tetap pre-format id-ID untuk backward compat kalau ada
  // caller lama yang belum migrate ke `noteI18n`.
  if (preset.slug === "oil_change") {
    const lastEngine = pickLatestEngineOil([...records]);
    const intervalFromCat = category ? engineIntervalMid(category) : null;
    const interval = intervalFromCat ?? preset.km;
    const intervalStr = interval.toLocaleString("id-ID");

    if (lastEngine) {
      const target = lastEngine.km + interval;
      const lastKmStr = lastEngine.km.toLocaleString("id-ID");
      // If the *historical* target is already in the past, the user is
      // overdue. Snapping to current+interval gives them a forward-looking
      // reminder rather than something already-due-by-design.
      if (target <= currentKm) {
        return {
          available: true,
          source: "history",
          km: currentKm + interval,
          note: `Sudah lewat — set ulang ${intervalStr} km dari sekarang`,
          noteI18n: {
            key: "reminderSuggestion.oilChangeOverdue",
            vars: { interval },
          },
        };
      }
      return {
        available: true,
        source: "history",
        km: target,
        note: `Oli mesin terakhir di ${lastKmStr} km · interval ${intervalStr} km`,
        noteI18n: {
          key: "reminderSuggestion.oilChangeHistory",
          vars: { km: lastEngine.km, interval },
        },
      };
    }
    return {
      available: true,
      source: "fallback",
      km: currentKm + interval,
      note: "Belum ada riwayat ganti oli — pakai estimasi dari KM saat ini",
      noteI18n: { key: "reminderSuggestion.oilChangeFallback", vars: {} },
    };
  }

  // ── cvt / brake: derive from part-condition history ──────────────
  const slugs = KM_PART_SLUGS[preset.slug];
  if (!slugs) {
    return { available: false, source: "none", km: null, note: "", noteI18n: EMPTY_NOTE };
  }

  // Pick the most recent change across all candidate slugs. Each kind has
  // its own interval; we use the kind that produced the latest record so
  // the "next due" projection lines up with what was actually replaced.
  let latest: { km: number; date: string; slug: string } | null = null;
  for (const slug of slugs) {
    const hit = pickLatestChangeBySlug([...records], slug);
    if (!hit) continue;
    if (!latest || hit.date > latest.date) {
      latest = { ...hit, slug };
    }
  }

  // Derive the interval. Prefer the catalog interval matching whichever
  // sub-kind was last changed; fall back to preset.km.
  const intervalFromKind = latest
    ? PART_KIND_BY_SLUG[latest.slug]?.interval_km ?? null
    : null;
  const interval =
    intervalFromKind && intervalFromKind > 0 ? intervalFromKind : preset.km;
  const intervalStr = interval.toLocaleString("id-ID");

  if (latest) {
    const target = latest.km + interval;
    const partKind = PART_KIND_BY_SLUG[latest.slug];
    const partLabel = partKind?.display_label ?? preset.label;
    const partKey = partKind?.display_label_key;
    const lastKmStr = latest.km.toLocaleString("id-ID");
    if (target <= currentKm) {
      return {
        available: true,
        source: "history",
        km: currentKm + interval,
        note: `${partLabel} sudah lewat interval — set ulang ${intervalStr} km dari sekarang`,
        noteI18n: {
          key: "reminderSuggestion.partOverdue",
          // Raw numbers untuk `interval` — auto-format via `t()`.
          vars: { part: partLabel, interval },
          partKey,
        },
      };
    }
    return {
      available: true,
      source: "history",
      km: target,
      note: `${partLabel} terakhir di ${lastKmStr} km · interval ${intervalStr} km`,
      noteI18n: {
        key: "reminderSuggestion.partHistory",
        // Raw numbers untuk `km` & `interval` — auto-format via `t()`.
        vars: { part: partLabel, km: latest.km, interval },
        partKey,
      },
    };
  }

  return {
    available: true,
    source: "fallback",
    km: currentKm + interval,
    note: `Belum ada riwayat ${preset.label.toLowerCase()} — pakai estimasi dari KM saat ini`,
    noteI18n: {
      key: "reminderSuggestion.partFallback",
      vars: { part: preset.label.toLowerCase() },
      partKey: preset.labelKey,
    },
  };
}

/* ──────────────────────────────────────────────────────────────────
 * Time suggestion
 *
 * Only Aki (battery) has a meaningful "by system" time signal in our
 * current data model — it's the only preset where the catalog defines a
 * time interval (`interval_months: 24`). Other presets fall through with
 * `available: false` so the UI keeps the manual schedule controls only.
 * ──────────────────────────────────────────────────────────────── */

export function computeTimeSuggestion({
  preset,
  records,
  now = new Date(),
}: SuggestionInputs): TimeSuggestion {
  if (preset.slug !== "battery") {
    return {
      available: false,
      source: "none",
      iso: null,
      daysAhead: null,
      note: "",
      noteI18n: EMPTY_NOTE,
    };
  }

  const intervalMonths = PART_KIND_BY_SLUG.battery?.interval_months ?? null;
  const intervalDays =
    intervalMonths && intervalMonths > 0
      ? Math.round((intervalMonths * 365.25) / 12)
      : preset.days;
  const months = intervalMonths ?? Math.round(intervalDays / 30);

  const last = pickLatestChangeBySlug([...records], "battery");
  if (last) {
    // Normalize last-change date to noon local to avoid TZ off-by-one when
    // adding days then formatting.
    const base = new Date(last.date + "T12:00:00");
    const nextDate = new Date(base);
    nextDate.setDate(nextDate.getDate() + intervalDays);

    if (nextDate.getTime() <= now.getTime()) {
      return {
        available: true,
        source: "history",
        iso: isoDaysAhead(intervalDays, now),
        daysAhead: intervalDays,
        note: `Aki sudah lewat masa pakai — set ulang ${months} bulan dari sekarang`,
        noteI18n: {
          key: "reminderSuggestion.batteryOverdue",
          vars: { months },
        },
      };
    }
    nextDate.setHours(9, 0, 0, 0);
    const days = daysBetween(nextDate, now);
    return {
      available: true,
      source: "history",
      iso: nextDate.toISOString(),
      daysAhead: days,
      note: `Aki terakhir diganti ${last.date} · masa pakai ~${months} bulan`,
      noteI18n: {
        key: "reminderSuggestion.batteryHistory",
        vars: { date: last.date, months },
      },
    };
  }

  return {
    available: true,
    source: "fallback",
    iso: isoDaysAhead(intervalDays, now),
    daysAhead: intervalDays,
    note: "Belum ada riwayat ganti aki — pakai estimasi dari hari ini",
    noteI18n: { key: "reminderSuggestion.batteryFallback", vars: {} },
  };
}

/* Re-export used helper so callers don't need a separate import. */
export { intervalMidKm };
