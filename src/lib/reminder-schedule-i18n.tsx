"use client";

/**
 * i18n-aware wrapper untuk `reminder-schedule.ts`.
 *
 * Kenapa dipisah file? File `reminder-schedule.ts` sengaja tetap pure (no
 * React deps) supaya bisa dipanggil dari path server-side / test tanpa
 * warning "use client". Fungsi format yang butuh `t()` hidup di sini.
 *
 * Konvensi return: string siap-tampil (bukan JSX). Callers `<p>{summary}</p>`.
 */

import { useCallback } from "react";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { sortWeekdaysForDisplay, WEEKDAYS, type ScheduleSpec } from "./reminder-schedule";

/** Map `Date.getDay()` value → i18n key untuk long-form weekday name. */
const LONG_KEY_BY_VALUE: Record<number, TranslationKey> = WEEKDAYS.reduce(
  (acc, w) => {
    acc[w.value] = w.longKey;
    return acc;
  },
  {} as Record<number, TranslationKey>,
);

/**
 * Return a locale-aware summary of a `ScheduleSpec`.
 *
 *  - once: "Pada 5 Juni 2026" / "On June 5, 2026" — {date} pre-formatted
 *  - daily: "setiap hari" / "every day"
 *  - weekly: "setiap Senin, Rabu" / "every Monday, Wednesday"
 *  - monthly: "setiap tanggal 5" / "every day 5 of the month"
 *
 * Empty aux fields render as placeholder ("Pilih tanggal", "Pilih hari", ...)
 * agar user tahu perlu isi.
 */
export function useFormatScheduleSummary() {
  const { t, formatDate } = useTranslation();
  return useCallback(
    (spec: ScheduleSpec | null): string => {
      if (!spec) return "";
      switch (spec.kind) {
        case "once": {
          const d = new Date(spec.once_at);
          if (Number.isNaN(d.getTime())) return t("reminderSchedule.pickDate");
          const dateStr = formatDate(d, {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          return t("reminderSchedule.onDate", { date: dateStr });
        }

        case "daily":
          return t("reminderSchedule.everyDay");

        case "weekly": {
          const sorted = sortWeekdaysForDisplay(spec.weekdays);
          if (sorted.length === 0) return t("reminderSchedule.pickWeekdays");
          const labels = sorted
            .map((v) => LONG_KEY_BY_VALUE[v])
            .filter(Boolean)
            .map((key) => t(key));
          return t("reminderSchedule.everyWeekdays", { days: labels.join(", ") });
        }

        case "monthly":
          if (!spec.day_of_month) return t("reminderSchedule.pickDom");
          return t("reminderSchedule.everyDom", { n: spec.day_of_month });
      }
    },
    [t, formatDate],
  );
}
