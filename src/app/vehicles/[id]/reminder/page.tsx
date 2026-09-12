"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  createReminderForVehicle,
  deleteReminderForVehicle,
  fetchRemindersForVehicle,
  fetchServiceRecordsForVehicle,
  fetchVehicleDetail,
  getLatestMileageKm,
  ReminderValidationError,
  updateReminderForVehicle,
} from "@/lib/supabase";
import {
  computeKmSuggestion,
  computeTimeSuggestion,
  type KmSuggestion,
  type TimeSuggestion,
} from "@/lib/reminder-suggestions";
import { CardSkeleton } from "@/components/LoadingSkeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import SwipeableRow from "@/components/SwipeableRow";
import { Button, IconButton, Modal, SectionLabel, TextInput } from "@/components/ui";
import {
  REMINDER_PRESETS,
  getReminderPreset,
  type ReminderPreset,
  type ReminderPresetSlug,
} from "@/lib/reminder-presets";
import {
  WEEKDAYS,
  buildScheduleSpec,
  computeNextOccurrence,
  type ScheduleKind,
  type ScheduleSpec,
} from "@/lib/reminder-schedule";
import { useFormatScheduleSummary } from "@/lib/reminder-schedule-i18n";
import { evaluateReminder } from "@/lib/notification-engine";
import type { MotorcycleCategory, Reminder, ServiceRecord } from "@/lib/types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

/* ──────────────────────────────────────────────────────────────────
 * Status / formatting helpers
 * ──────────────────────────────────────────────────────────────── */

type ReminderStatus = "aman" | "mendekati" | "telat";

/**
 * Status derivation delegated to the shared notification engine so the
 * chip in the list and the notification firing decision can never diverge.
 *
 * The engine returns `terlewat`; we map to the existing `telat` chip key
 * to keep the rest of the file unchanged. (Both spellings are interchangeable
 * in our copy — `telat` reads slightly more colloquial.)
 */
function computeStatus(r: Reminder, latestKm: number): ReminderStatus {
  const evalRes = evaluateReminder(r, latestKm);
  if (evalRes.status === "terlewat") return "telat";
  return evalRes.status;
}

// Reminder status tone — mode-aware via `--zone-*` tokens (safe/warn/alarm):
//   - aman     : surface-alt (soft) + dot zone-safe
//   - mendekati: surface-alt + dot zone-warn (monitor)
//   - telat    : zone-alarm inverted bg (loud alarm) + high-contrast text
// telat.dot pakai `--color-bg` (bukan zone token) supaya kontras terhadap
// alarm chip bg — visual "dot pada chip" seperti focus indicator.
const STATUS_TONE: Record<ReminderStatus, { chip: string; dot: string }> = {
  aman: {
    chip: "bg-(--color-surface-alt) text-(--color-text-secondary)",
    dot: "bg-(--zone-safe)",
  },
  mendekati: {
    chip: "bg-(--color-surface-alt) text-(--color-text)",
    dot: "bg-(--zone-warn)",
  },
  telat: {
    chip: "bg-(--zone-alarm) text-(--color-bg) font-bold",
    dot: "bg-(--color-bg)",
  },
};

/* ──────────────────────────────────────────────────────────────────
 * Date helpers (form)
 * ──────────────────────────────────────────────────────────────── */

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function ymdPlusDays(days: number): string {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function localYmdToIso(ymd: string): string {
  const [ys, ms, ds] = ymd.split("-");
  const y = parseInt(ys ?? "", 10);
  const mo = parseInt(ms ?? "", 10);
  const day = parseInt(ds ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) {
    return new Date().toISOString();
  }
  return new Date(y, mo - 1, day, 9, 0, 0, 0).toISOString();
}

function isoToYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayYmd();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ──────────────────────────────────────────────────────────────────
 * Style tokens
 * ──────────────────────────────────────────────────────────────── */

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 active:scale-95";
// Chip active pakai `--color-text` (dark neutral) untuk match login CTA tone.
// Sebelumnya bg-blue-500 — sekarang monochrome consistent dengan seluruh app.
const CHIP_ACTIVE =
  "bg-(--color-text) text-(--color-bg) shadow-sm shadow-(--color-text)/20";
const CHIP_IDLE =
  "bg-(--color-surface-alt) text-(--color-text-secondary) hover:text-(--color-text)";

/* ──────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────── */

export default function ReminderPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { t, formatNumber } = useTranslation();
  // i18n-aware wrapper for schedule summary; keeps hook rules happy while
  // letting summary read "Pada 5 Juni 2026" / "On June 5, 2026" per locale.
  const formatSchedule = useFormatScheduleSummary();

  /**
   * Translate service errors ke bahasa user. Sengaja TIDAK render
   * `err.message` mentah karena itu mungkin string English/ID hard-coded
   * dari layer bawah — bakal janggal kalau user lagi di locale sebaliknya.
   * Untuk numeric params (mis. `target_km_too_low`) pre-format dulu via
   * `formatNumber` supaya thousand-separator ikut locale ("50.000" vs
   * "50,000"). Fallback dipakai bila error bukan `ReminderValidationError`.
   */
  const describeReminderError = useCallback(
    (err: unknown, fallbackMsg: string): string => {
      if (err instanceof ReminderValidationError) {
        const key = `reminderError.${err.code}` as TranslationKey;
        const params: Record<string, string | number> = { ...err.params };
        for (const k of Object.keys(params)) {
          const v = params[k];
          if (typeof v === "number") params[k] = formatNumber(v);
        }
        return t(key, params);
      }
      return fallbackMsg;
    },
    [t, formatNumber],
  );

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [latestKm, setLatestKm] = useState<number>(0);
  /** Catalog data for the vehicle's motorcycle category — needed to derive
   *  per-merk oil intervals in the "Otomatis" suggestion. */
  const [category, setCategory] = useState<MotorcycleCategory | null>(null);
  /** Recent service records, used by `reminder-suggestions` for KM/time
   *  threshold derivation (oil + part-condition history). */
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  /* Form state */
  const [showForm, setShowForm] = useState(false);
  /** When set, the form acts as edit-mode for this reminder id. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [presetSlug, setPresetSlug] = useState<ReminderPresetSlug>("oil_change");
  const [useKm, setUseKm] = useState(true);
  const [kmValue, setKmValue] = useState("");
  const [kmAlertMode, setKmAlertMode] = useState<"once" | "daily">("once");
  const [useTime, setUseTime] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleSpec | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * "Otomatis" vs "Manual" mode for each dimension.
   *
   *  - `auto`: input is read-only, value is sourced from the live suggestion
   *    derived in `reminder-suggestions` (snapshot at submit time).
   *  - `manual`: user controls the input directly.
   *
   * Defaults to `"auto"` when a preset has an available suggestion (smart-
   * first UX), `"manual"` otherwise. Edits always start in `"manual"` so we
   * preserve the value the user previously chose.
   */
  const [kmMode, setKmMode] = useState<"auto" | "manual">("auto");
  const [timeMode, setTimeMode] = useState<"auto" | "manual">("manual");

  /* Delete state */
  const [pendingDelete, setPendingDelete] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState(false);
  /**
   * Single source of truth for which row is currently slid open. Hoisted to
   * the page so opening one row auto-closes the others (matches Overview /
   * iOS Mail conventions).
   */
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Fan out four independent reads — all needed up-front so that when
      // the user opens the bottom sheet, the "Otomatis" suggestion is ready
      // without an extra spinner. `Promise.allSettled` keeps a single
      // failure (e.g. RLS hiccup on records) from blanking the whole page.
      const [listRes, kmRes, detailRes, recordsRes] = await Promise.allSettled([
        fetchRemindersForVehicle(id as string),
        getLatestMileageKm(id as string),
        fetchVehicleDetail(id as string),
        fetchServiceRecordsForVehicle(id as string),
      ]);

      if (listRes.status === "fulfilled") setReminders(listRes.value);
      else throw listRes.reason;

      if (kmRes.status === "fulfilled") setLatestKm(kmRes.value);

      if (detailRes.status === "fulfilled") {
        setCategory(detailRes.value?.motorcycle_category ?? null);
      }
      if (recordsRes.status === "fulfilled") setRecords(recordsRes.value);
    } catch (err) {
      toast.error(describeReminderError(err, t("reminderPage.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [id, t, describeReminderError]);

  useEffect(() => {
    if (!user || !id) return;
    void loadAll();
  }, [user, id, loadAll]);

  const preset = useMemo<ReminderPreset>(
    () => getReminderPreset(presetSlug) ?? REMINDER_PRESETS[0],
    [presetSlug],
  );

  /**
   * Live "Otomatis" suggestion for the currently selected preset. Recomputed
   * whenever the preset, current odometer, category, or service history
   * changes — but the value the user actually submits is captured at
   * `handleSubmit` time (snapshot semantics, see `reminder-suggestions`).
   */
  const kmSuggestion: KmSuggestion = useMemo(
    () => computeKmSuggestion({ preset, currentKm: latestKm, category, records }),
    [preset, latestKm, category, records],
  );
  const timeSuggestion: TimeSuggestion = useMemo(
    () => computeTimeSuggestion({ preset, currentKm: latestKm, category, records }),
    [preset, latestKm, category, records],
  );

  /**
   * `kmValue` now represents the **absolute target KM** the reminder fires
   * at, not an interval. We derive the interval at submit time so the input
   * stays intuitive ("Ingatkan saat mencapai 15.000 km" reads better than
   * "Setiap 2.500 km dari servis terakhir").
   */
  const targetKmNum = useMemo(() => {
    const n = parseInt(kmValue, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [kmValue]);
  const kmTargetValid = targetKmNum > latestKm;

  const scheduleValid = useMemo(() => {
    if (!schedule) return false;
    switch (schedule.kind) {
      case "once":
        return !!schedule.once_at;
      case "daily":
        return true;
      case "weekly":
        return schedule.weekdays.length > 0;
      case "monthly":
        return schedule.day_of_month >= 1 && schedule.day_of_month <= 31;
    }
  }, [schedule]);

  const canSubmit =
    !submitting &&
    (useKm || useTime) &&
    (!useKm || kmTargetValid) &&
    (!useTime || scheduleValid);

  /* Summary preview lines (separate so we can render KM + schedule on
     two lines, matching the spec sample). */
  const summaryLines = useMemo<string[]>(() => {
    const lines: string[] = [];
    if (useKm && kmTargetValid) {
      lines.push(
        kmAlertMode === "daily"
          ? t("reminderPage.summaryAtKmDaily", { km: formatNumber(targetKmNum) })
          : t("reminderPage.summaryAtKmOnce", { km: formatNumber(targetKmNum) }),
      );
    }
    if (useTime && schedule && scheduleValid) {
      const summary = formatSchedule(schedule);
      const prefix = lines.length > 0 ? t("reminderPage.summaryPrefix") : "";
      lines.push(`${prefix}${summary}`);
    }
    if (lines.length === 0) lines.push(t("reminderPage.summaryPickOne"));
    return lines;
  }, [useKm, targetKmNum, kmTargetValid, kmAlertMode, useTime, schedule, scheduleValid, t, formatNumber, formatSchedule]);

  /* Default schedule when toggle goes ON (per preset / per kind). */
  const defaultScheduleForKind = useCallback(
    (kind: ScheduleKind, p: ReminderPreset): ScheduleSpec => {
      switch (kind) {
        case "once":
          // Aki defaults to today + ~2 years; others fall back to today.
          return { kind: "once", once_at: localYmdToIso(ymdPlusDays(Math.max(1, p.days || 0))) };
        case "daily":
          return { kind: "daily" };
        case "weekly":
          return { kind: "weekly", weekdays: [new Date().getDay()] };
        case "monthly":
          return { kind: "monthly", day_of_month: new Date().getDate() };
      }
    },
    [],
  );

  /* Handlers */

  /**
   * Compute the seed KM value when (re)entering Auto mode for a preset.
   * Falls back to "current + preset.km" if the suggestion engine has nothing
   * to offer (which shouldn't happen when `available` is true, but defensive
   * coding is cheap here).
   */
  const seedKmForPreset = useCallback(
    (p: ReminderPreset): { value: string; mode: "auto" | "manual" } => {
      const sug = computeKmSuggestion({ preset: p, currentKm: latestKm, category, records });
      if (sug.available && sug.km != null) {
        return { value: String(sug.km), mode: "auto" };
      }
      // Auto unavailable → fall back to manual with a sensible placeholder.
      const fallback = p.km > 0 ? String(latestKm + p.km) : "";
      return { value: fallback, mode: "manual" };
    },
    [latestKm, category, records],
  );

  const seedScheduleForPreset = useCallback(
    (p: ReminderPreset): { spec: ScheduleSpec | null; mode: "auto" | "manual" } => {
      if (!p.defaultUseTime) return { spec: null, mode: "manual" };
      const sug = computeTimeSuggestion({ preset: p, currentKm: latestKm, category, records });
      if (sug.available && sug.iso) {
        return { spec: { kind: "once", once_at: sug.iso }, mode: "auto" };
      }
      return { spec: defaultScheduleForKind(p.defaultScheduleKind, p), mode: "manual" };
    },
    [latestKm, category, records, defaultScheduleForKind],
  );

  const openForm = useCallback(() => {
    const p = REMINDER_PRESETS[0];
    setEditingId(null);
    setPresetSlug(p.slug);
    setUseKm(p.defaultUseKm);
    const km = seedKmForPreset(p);
    setKmValue(km.value);
    setKmMode(km.mode);
    setKmAlertMode("once");
    setUseTime(p.defaultUseTime);
    const sched = seedScheduleForPreset(p);
    setSchedule(sched.spec);
    setTimeMode(sched.mode);
    setShowForm(true);
  }, [seedKmForPreset, seedScheduleForPreset]);

  /**
   * Prefill the form from an existing reminder for editing.
   *
   * For overdue reminders we suggest a fresh target = current_km +
   * (original interval). Intent: "I just serviced it, set me up for the next
   * one". For still-future reminders we keep the original target verbatim.
   */
  const openEditForm = useCallback(
    (r: Reminder) => {
      setEditingId(r.id);
      const slug = (r.preset_slug as ReminderPresetSlug) ?? "oil_change";
      const p = getReminderPreset(slug) ?? REMINDER_PRESETS[0];
      setPresetSlug(p.slug);

      const hasKm = r.km_interval > 0 && r.next_due_km > 0;
      setUseKm(hasKm);
      if (hasKm) {
        const isOverdue = r.next_due_km <= latestKm;
        const suggested = isOverdue
          ? latestKm + Math.max(1, r.next_due_km - r.last_service_km)
          : r.next_due_km;
        setKmValue(String(suggested));
      } else {
        setKmValue("");
      }
      setKmAlertMode(r.km_alert_mode === "daily" ? "daily" : "once");

      const spec = buildScheduleSpec(r);
      setUseTime(!!spec);
      setSchedule(spec);

      // Edit always opens in Manual so the user's previously-saved value is
      // preserved verbatim. Switching to Auto in the form will overwrite it
      // with the live suggestion — that's the explicit opt-in.
      setKmMode("manual");
      setTimeMode("manual");

      setShowForm(true);
      setOpenSwipeId(null);
    },
    [latestKm],
  );

  const closeForm = useCallback(() => {
    // Guard: don't allow dismissal mid-submit so the user doesn't lose data
    // by accident or end up in an ambiguous state.
    if (submitting) return;
    setShowForm(false);
    setEditingId(null);
  }, [submitting]);

  const handlePresetPick = useCallback(
    (slug: ReminderPresetSlug) => {
      const p = getReminderPreset(slug);
      if (!p) return;
      setPresetSlug(slug);
      setUseKm(p.defaultUseKm);
      const km = seedKmForPreset(p);
      setKmValue(km.value);
      setKmMode(km.mode);
      // Reset alert mode to default. Switching presets is "I want this preset's
      // intent" — sticky overrides would surprise the user.
      setKmAlertMode("once");
      setUseTime(p.defaultUseTime);
      const sched = seedScheduleForPreset(p);
      setSchedule(sched.spec);
      setTimeMode(sched.mode);
    },
    [seedKmForPreset, seedScheduleForPreset],
  );

  /**
   * Switch the KM dimension between Auto and Manual.
   *
   *  - auto: snap kmValue to the live suggestion (no-op if it's null)
   *  - manual: keep whatever value is currently shown so the user can edit
   *    starting from a familiar number, not an empty field.
   */
  const handleKmModeChange = useCallback(
    (next: "auto" | "manual") => {
      setKmMode(next);
      if (next === "auto" && kmSuggestion.available && kmSuggestion.km != null) {
        setKmValue(String(kmSuggestion.km));
      }
    },
    [kmSuggestion],
  );

  const handleTimeModeChange = useCallback(
    (next: "auto" | "manual") => {
      setTimeMode(next);
      if (next === "auto" && timeSuggestion.available && timeSuggestion.iso) {
        setSchedule({ kind: "once", once_at: timeSuggestion.iso });
      }
    },
    [timeSuggestion],
  );

  /**
   * Keep auto-mode values pinned to the live suggestion. If the user is in
   * Manual we never overwrite their input. We deliberately depend on the
   * suggestion's primitive output (km / iso) rather than the object itself
   * so a stable computation doesn't trigger spurious re-syncs.
   */
  useEffect(() => {
    if (kmMode !== "auto" || !showForm) return;
    if (!kmSuggestion.available || kmSuggestion.km == null) return;
    setKmValue(String(kmSuggestion.km));
  }, [kmMode, showForm, kmSuggestion.available, kmSuggestion.km]);

  useEffect(() => {
    if (timeMode !== "auto" || !showForm) return;
    if (!timeSuggestion.available || !timeSuggestion.iso) return;
    setSchedule({ kind: "once", once_at: timeSuggestion.iso });
  }, [timeMode, showForm, timeSuggestion.available, timeSuggestion.iso]);

  const handleScheduleKindPick = useCallback(
    (kind: ScheduleKind) => {
      // Preserve user-entered values when switching across compatible kinds
      // (e.g. once date stays if they flip back). For brand new kinds we
      // seed with sane defaults.
      setSchedule((prev) => {
        if (prev?.kind === kind) return prev;
        if (kind === "once") {
          const seed =
            prev?.kind === "once"
              ? prev
              : { kind: "once" as const, once_at: localYmdToIso(ymdPlusDays(0)) };
          return seed;
        }
        return defaultScheduleForKind(kind, preset);
      });
    },
    [preset, defaultScheduleForKind],
  );

  const handleToggleTime = useCallback(
    (next: boolean) => {
      setUseTime(next);
      if (next && !schedule) {
        setSchedule(defaultScheduleForKind(preset.defaultScheduleKind, preset));
      }
    },
    [schedule, preset, defaultScheduleForKind],
  );

  const handleSubmit = useCallback(async () => {
    if (!id || !canSubmit) return;
    const isEdit = editingId !== null;
    const payload = {
      preset_slug: preset.slug,
      use_km: useKm,
      target_km: useKm ? targetKmNum : undefined,
      km_alert_mode: useKm ? kmAlertMode : undefined,
      schedule: useTime ? schedule : null,
    };
    setSubmitting(true);
    try {
      if (isEdit && editingId) {
        const updated = await updateReminderForVehicle(editingId, id as string, payload);
        toast.success(t("reminderPage.updatedToast", { name: t(preset.labelKey) }));
        setReminders((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await createReminderForVehicle(id as string, payload);
        toast.success(t("reminderPage.createdToast", { name: t(preset.labelKey) }));
        setReminders((prev) => [created, ...prev]);
      }
      void loadAll();
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      toast.error(
        describeReminderError(
          err,
          isEdit ? t("reminderPage.updateFailed") : t("reminderPage.createFailed"),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    id,
    canSubmit,
    editingId,
    useKm,
    useTime,
    targetKmNum,
    kmAlertMode,
    schedule,
    preset,
    loadAll,
    t,
    describeReminderError,
  ]);

  const requestDelete = useCallback((r: Reminder) => setPendingDelete(r), []);
  const confirmDelete = useCallback(async () => {
    const target = pendingDelete;
    if (!target || deleting) return;
    setDeleting(true);
    // Close any open swipe before optimistic remove so the row doesn't snap
    // back visually after the underlying card disappears.
    setOpenSwipeId(null);
    const previous = reminders;
    setReminders((prev) => prev.filter((x) => x.id !== target.id));
    try {
      await deleteReminderForVehicle(target.id);
      toast.success(t("reminderPage.deletedToast"));
    } catch (err) {
      setReminders(previous);
      toast.error(describeReminderError(err, t("reminderPage.deleteFailed")));
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }, [pendingDelete, deleting, reminders, t, describeReminderError]);

  if (authLoading || !user) return null;

  const hasReminders = reminders.length > 0;
  const showHeaderAddBtn = hasReminders && !showForm;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col px-5 pb-24 pt-5">
        <IconButton
          label={t("common.back")}
          variant="ghost"
          size="lg"
          onClick={() => router.push(`/vehicles/${id}`)}
          className="mb-4 self-start"
        >
          <BackArrowIcon className="h-5 w-5" />
        </IconButton>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <SectionLabel>{t("reminderPage.eyebrow")}</SectionLabel>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{t("reminderPage.title")}</h1>
          </div>
          {showHeaderAddBtn ? (
            <Button variant="primary" size="sm" onClick={openForm} className="shrink-0">
              {t("reminderPage.addBtn")}
            </Button>
          ) : null}
        </div>

        {latestKm > 0 ? (
          <p className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-(--color-surface-alt) px-3 py-1 text-xs font-medium text-(--color-text-secondary)">
            <span aria-hidden>📍</span> {t("reminderPage.currentKm", { km: formatNumber(latestKm) })}
          </p>
        ) : null}

        {/* ── List / loader / empty ───────────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : hasReminders ? (
          <>
            <p className="mb-3 text-[11px] text-(--color-text-muted)">
              {t("reminderPage.listHint")}
            </p>
            <div className="flex flex-col gap-3" role="list">
              {reminders.map((r) => (
                <SwipeableRow
                  key={r.id}
                  isOpen={openSwipeId === r.id}
                  onOpenChange={(open) =>
                    setOpenSwipeId(open ? r.id : openSwipeId === r.id ? null : openSwipeId)
                  }
                  onAction={() => requestDelete(r)}
                  disabled={deleting}
                >
                  <ReminderRow
                    reminder={r}
                    latestKm={latestKm}
                    onEdit={() => openEditForm(r)}
                  />
                </SwipeableRow>
              ))}
            </div>
          </>
        ) : (
          <EmptyReminderCTA onClick={openForm} hidden={showForm} />
        )}
      </main>

      {/* ── Quick Setup bottom sheet ──────────────────────────── */}
      <Modal
        open={showForm}
        onClose={closeForm}
        variant="sheet"
        ariaLabelledBy="reminder-form-title"
        ariaBusy={submitting}
        dismissible={!submitting}
        contentClassName="max-h-[85dvh] flex flex-col"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--color-border)/60 px-5 py-4">
          <div>
            <h2
              id="reminder-form-title"
              className="text-lg font-extrabold text-(--color-text)"
            >
              {editingId ? t("reminderPage.formEditTitle") : t("reminderPage.formAddTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-(--color-text-secondary)">
              {editingId ? t("reminderPage.formEditSubtitle") : t("reminderPage.formAddSubtitle")}
            </p>
          </div>
          <IconButton
            label={t("common.close")}
            onClick={closeForm}
            disabled={submitting}
            className="-mr-1 -mt-1"
          >
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5">
          {/* Preset chips */}
          <div>
            <SectionLabel>{t("reminderPage.presetLabel")}</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {REMINDER_PRESETS.map((p) => {
                const active = p.slug === presetSlug;
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => handlePresetPick(p.slug)}
                    className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                    aria-pressed={active}
                  >
                    <span aria-hidden>{p.icon}</span>
                    {t(p.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KM dimension */}
          <KmField
            enabled={useKm}
            onEnabledChange={setUseKm}
            value={kmValue}
            onValueChange={(v) => {
              // Direct edit ⇒ user wants Manual control. Auto-switching
              // here is more discoverable than forcing them to tap the
              // segmented control first.
              if (kmMode === "auto") setKmMode("manual");
              setKmValue(v);
            }}
            latestKm={latestKm}
            suggestedTarget={preset.km > 0 ? latestKm + preset.km : null}
            alertMode={kmAlertMode}
            onAlertModeChange={setKmAlertMode}
            mode={kmMode}
            onModeChange={handleKmModeChange}
            suggestion={kmSuggestion}
          />

          {/* Schedule dimension */}
          <ScheduleField
            enabled={useTime}
            onEnabledChange={handleToggleTime}
            schedule={schedule}
            onScheduleChange={(spec) => {
              if (timeMode === "auto") setTimeMode("manual");
              setSchedule(spec);
            }}
            onKindPick={(k) => {
              if (timeMode === "auto") setTimeMode("manual");
              handleScheduleKindPick(k);
            }}
            mode={timeMode}
            onModeChange={handleTimeModeChange}
            suggestion={timeSuggestion}
          />

          {/* Summary preview */}
          <div className="rounded-xl border border-(--color-border)/40 bg-(--color-surface-alt)/40 p-3">
            <SectionLabel>{t("reminderPage.summary")}</SectionLabel>
            <ul className="mt-1 space-y-0.5">
              {summaryLines.map((line, i) => (
                <li
                  key={i}
                  className="text-xs font-medium text-(--color-text-secondary)"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sticky footer CTA — selalu terlihat tanpa harus scroll. */}
        <div className="shrink-0 border-t border-(--color-border)/60 bg-(--color-bg) px-5 py-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))]">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? editingId
                ? t("reminderPage.saving")
                : t("reminderPage.activating")
              : editingId
                ? t("reminderPage.saveChanges")
                : t("reminderPage.activateReminder")}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title={t("reminderPage.deleteTitle")}
        message={
          pendingDelete
            ? (() => {
                const preset = getReminderPreset(pendingDelete.preset_slug);
                const name = preset
                  ? t(preset.labelKey)
                  : pendingDelete.service_type === "heavy"
                    ? t("reminderPage.serviceHeavy")
                    : t("reminderPage.serviceLight");
                return t("reminderPage.deleteMessage", { name });
              })()
            : ""
        }
        confirmLabel={deleting ? t("reminderPage.deleting") : t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (deleting) return;
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Reminder list row
 * ──────────────────────────────────────────────────────────────── */

function ReminderRow({
  reminder: r,
  latestKm,
  onEdit,
}: {
  reminder: Reminder;
  latestKm: number;
  /** Triggered when user taps the card. SwipeableRow's click-capture handles
   *  swipe-vs-tap disambiguation upstream, so tap intent here is genuine. */
  onEdit: () => void;
}) {
  const { t, formatNumber } = useTranslation();
  const formatSchedule = useFormatScheduleSummary();
  // Live re-derivation of the schedule date for repeat reminders so the row
  // shows "Sisa 5 hari" today rather than a stale snapshot from creation time.
  const scheduleSpec = useMemo(() => buildScheduleSpec(r), [r]);
  const scheduleNext = useMemo(
    () => (scheduleSpec ? computeNextOccurrence(scheduleSpec) : null),
    [scheduleSpec],
  );
  const scheduleSummary = scheduleSpec ? formatSchedule(scheduleSpec) : null;

  const status = computeStatus(r, latestKm);
  const tone = STATUS_TONE[status];
  const statusLabel = {
    aman: t("reminderPage.statusSafe"),
    mendekati: t("reminderPage.statusApproaching"),
    telat: t("reminderPage.statusOverdue"),
  }[status];
  const p = getReminderPreset(r.preset_slug);
  const remainingKm = (() => {
    if (r.km_interval <= 0 || r.next_due_km <= 0) return null;
    const diff = r.next_due_km - latestKm;
    if (diff < 0) return t("reminderPage.kmOverdue", { n: formatNumber(Math.abs(diff)) });
    return t("reminderPage.kmRemaining", { n: formatNumber(diff) });
  })();
  const remainingTime = (() => {
    const d = scheduleNext ?? (r.next_due_date ? new Date(r.next_due_date) : null);
    if (!d) return null;
    const ms = d.getTime() - Date.now();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    if (days < 0) return t("reminderPage.daysOverdue", { n: formatNumber(Math.abs(days)) });
    if (days === 0) return t("reminderPage.today");
    return t("reminderPage.daysRemaining", { n: formatNumber(days) });
  })();
  const fallbackLabel =
    r.service_type === "heavy" ? t("reminderPage.serviceHeavy") : t("reminderPage.serviceLight");
  const label = p ? t(p.labelKey) : fallbackLabel;

  return (
    <button
      type="button"
      role="listitem"
      onClick={onEdit}
      aria-label={t("reminderPage.editReminderAria", { name: label })}
      className="w-full rounded-2xl border border-(--color-border)/60 bg-(--color-surface) p-4 text-left shadow-sm transition-colors hover:border-(--color-border) active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--color-surface-alt) text-lg"
        >
          {p?.icon ?? "🔔"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-(--color-text)">{label}</p>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-(--color-text-secondary)">
            {remainingKm ? <span>{remainingKm}</span> : null}
            {remainingTime ? <span>{remainingTime}</span> : null}
            {!remainingKm && !remainingTime ? <span>{t("reminderPage.noActiveInterval")}</span> : null}
          </div>
          {/* Sub-line: schedule summary + km alert mode (only show when relevant). */}
          {scheduleSummary || (r.km_interval > 0 && r.km_alert_mode === "daily") ? (
            <p className="mt-1 text-[11px] text-(--color-text-muted)">
              {[
                scheduleSummary,
                r.km_interval > 0 && r.km_alert_mode === "daily"
                  ? t("reminderPage.kmDailyAlert")
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * KM dimension field
 * ──────────────────────────────────────────────────────────────── */

function KmField({
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  latestKm,
  suggestedTarget,
  alertMode,
  onAlertModeChange,
  mode,
  onModeChange,
  suggestion,
}: {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  value: string;
  onValueChange: (next: string) => void;
  /** Current odometer — used as the floor for validation + placeholder. */
  latestKm: number;
  /** Optional suggested target KM (current + preset interval). */
  suggestedTarget: number | null;
  alertMode: "once" | "daily";
  onAlertModeChange: (next: "once" | "daily") => void;
  mode: "auto" | "manual";
  onModeChange: (next: "auto" | "manual") => void;
  suggestion: KmSuggestion;
}) {
  const { t, formatNumber } = useTranslation();
  // Live validation. Shown inline only when user has entered something —
  // empty input shouldn't shout "invalid" before they finish typing.
  const parsed = parseInt(value, 10);
  const numeric = Number.isFinite(parsed) ? parsed : null;
  const tooLow = enabled && mode === "manual" && numeric !== null && numeric <= latestKm;
  const placeholder =
    suggestedTarget != null
      ? String(suggestedTarget)
      : latestKm > 0
        ? String(latestKm + 1)
        : t("reminderPage.kmPlaceholder");

  // Auto mode is only offered when the suggestion engine has something
  // meaningful for this preset. Otherwise the segmented control is hidden
  // entirely and the field acts like a plain manual input.
  const autoAvailable = suggestion.available;
  const isAuto = enabled && autoAvailable && mode === "auto";

  return (
    <div
      className={`rounded-xl border p-3 transition-colors duration-150 ${
        tooLow
          ? "border-(--color-text)/45 bg-(--color-surface-alt) ring-2 ring-(--color-text)/25"
          : enabled
            ? "border-(--color-primary)/50 bg-(--color-primary-soft)/40"
            : "border-(--color-border) bg-(--color-surface)"
      }`}
    >
      <ToggleHeader
        label={t("reminderPage.useKm")}
        enabled={enabled}
        onChange={onEnabledChange}
      />

      {/* Mode segmented control — hanya muncul kalau preset memang punya
          data history (oil_change, cvt, brake). Untuk preset lain (mis.
          regular_service) field langsung manual tanpa segmented. */}
      {enabled && autoAvailable ? (
        <ModeSegment
          mode={mode}
          onChange={onModeChange}
          autoLabel={t("reminderPage.auto")}
          manualLabel={t("reminderPage.manual")}
        />
      ) : null}

      <div className="mt-2">
        <SectionLabel className="mb-1.5">{t("reminderPage.whenReaching")}</SectionLabel>
        <TextInput
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, 7))}
          placeholder={placeholder}
          disabled={!enabled || isAuto}
          readOnly={isAuto}
          aria-label={t("reminderPage.targetKmAria")}
          error={tooLow}
          className={`tabular-nums font-semibold${
            isAuto && enabled ? " bg-(--color-primary-soft)/30" : ""
          }`}
          trailingSlot={
            <span className="text-xs font-semibold text-(--color-text-muted)">km</span>
          }
        />
      </div>

      {/* Hint / error / source-note line. Source note (when in auto) wins
          over the generic hint so user understands *why* this number. */}
      {enabled ? (
        isAuto ? (
          <p className="mt-1 flex items-start gap-1 text-[11px] text-(--color-text-muted)">
            <SystemDot source={suggestion.source} />
            <span>
              {suggestion.noteI18n.key
                ? t(suggestion.noteI18n.key, {
                    ...suggestion.noteI18n.vars,
                    // Kalau ada partKey, resolve dulu ke locale aktif; ini
                    // memastikan template `{part}` tampil "Chain & sprocket"
                    // di EN dan "Rantai & gear" di ID (bukan sebaliknya).
                    ...(suggestion.noteI18n.partKey
                      ? { part: t(suggestion.noteI18n.partKey) }
                      : {}),
                  })
                : suggestion.note}
            </span>
          </p>
        ) : tooLow ? (
          <p className="mt-1 text-[11px] font-bold text-(--color-text)">
            {t("reminderPage.targetTooLow", { km: formatNumber(latestKm) })}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-(--color-text-muted)">
            {t("reminderPage.currentKmHint", { km: formatNumber(latestKm) })}
            {suggestedTarget != null
              ? t("reminderPage.suggestedKm", { km: formatNumber(suggestedTarget) })
              : ""}
          </p>
        )
      ) : null}

      {/* Mode pengingat — apakah sekali atau berulang setelah threshold */}
      {enabled ? (
        <div className="mt-3 border-t border-(--color-border)/40 pt-2.5">
          <SectionLabel>{t("reminderPage.afterThreshold")}</SectionLabel>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(
              [
                { mode: "once" as const, label: t("reminderPage.alertOnce") },
                { mode: "daily" as const, label: t("reminderPage.alertDaily") },
              ]
            ).map(({ mode, label }) => {
              const active = alertMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onAlertModeChange(mode)}
                  className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-(--color-text-muted)">
            {alertMode === "daily"
              ? t("reminderPage.alertDailyHint")
              : t("reminderPage.alertOnceHint")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Schedule dimension field
 * ──────────────────────────────────────────────────────────────── */

function ScheduleField({
  enabled,
  onEnabledChange,
  schedule,
  onScheduleChange,
  onKindPick,
  mode,
  onModeChange,
  suggestion,
}: {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  schedule: ScheduleSpec | null;
  onScheduleChange: (next: ScheduleSpec | null) => void;
  onKindPick: (kind: ScheduleKind) => void;
  mode: "auto" | "manual";
  onModeChange: (next: "auto" | "manual") => void;
  suggestion: TimeSuggestion;
}) {
  const { t, formatDate } = useTranslation();
  const kind = schedule?.kind ?? null;
  const autoAvailable = suggestion.available;
  const isAuto = enabled && autoAvailable && mode === "auto";
  // Tipe top-level: once (Sekali) vs repeat-* (Berulang).
  const tipe: "once" | "repeat" | null = kind
    ? kind === "once"
      ? "once"
      : "repeat"
    : null;

  return (
    <div
      className={`rounded-xl border p-3 transition-colors duration-150 ${
        enabled
          ? "border-(--color-primary)/50 bg-(--color-primary-soft)/40"
          : "border-(--color-border) bg-(--color-surface)"
      }`}
    >
      <ToggleHeader
        label={t("reminderPage.useSchedule")}
        enabled={enabled}
        onChange={onEnabledChange}
      />

      {/* Mode segmented — hanya Aki (battery) yang punya time-by-system source. */}
      {enabled && autoAvailable ? (
        <ModeSegment
          mode={mode}
          onChange={onModeChange}
          autoLabel={t("reminderPage.auto")}
          manualLabel={t("reminderPage.manual")}
        />
      ) : null}

      {!enabled ? (
        <p className="mt-2 text-[11px] text-(--color-text-muted)">
          {t("reminderPage.scheduleDisabledHint")}
        </p>
      ) : isAuto ? (
        // Auto mode preview: show the computed date + source note. Inputs
        // hidden — user must tap "Manual" to tweak.
        <div className="mt-3 rounded-lg border border-(--color-primary)/40 bg-(--color-primary-soft)/30 p-3">
          <SectionLabel className="text-(--color-primary)">
            {t("reminderPage.remindOn")}
          </SectionLabel>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-(--color-text)">
            {suggestion.iso
              ? formatDate(suggestion.iso, {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "—"}
            {suggestion.daysAhead != null ? (
              <span className="ml-1.5 text-xs font-medium text-(--color-text-secondary)">
                {t("reminderPage.daysAhead", { n: suggestion.daysAhead })}
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-(--color-text-muted)">
            <SystemDot source={suggestion.source} />
            <span>
              {suggestion.noteI18n.key
                ? t(suggestion.noteI18n.key, {
                    ...suggestion.noteI18n.vars,
                    ...(suggestion.noteI18n.partKey
                      ? { part: t(suggestion.noteI18n.partKey) }
                      : {}),
                  })
                : suggestion.note}
            </span>
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Tipe pengingat */}
          <div>
            <SectionLabel>{t("reminderPage.reminderType")}</SectionLabel>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onKindPick("once")}
                className={`${CHIP_BASE} ${tipe === "once" ? CHIP_ACTIVE : CHIP_IDLE}`}
                aria-pressed={tipe === "once"}
              >
                {t("reminderPage.once")}
              </button>
              <button
                type="button"
                onClick={() =>
                  // Default repeat sub-kind: monthly. handleScheduleKindPick
                  // seeds the day_of_month from today.
                  onKindPick(
                    schedule && schedule.kind !== "once" ? schedule.kind : "monthly",
                  )
                }
                className={`${CHIP_BASE} ${tipe === "repeat" ? CHIP_ACTIVE : CHIP_IDLE}`}
                aria-pressed={tipe === "repeat"}
              >
                {t("reminderPage.repeat")}
              </button>
            </div>
          </div>

          {/* Sekali → date */}
          {schedule?.kind === "once" ? (
            <div>
              <label htmlFor="schedule-once-date" className="block">
                <SectionLabel as="span">{t("reminderPage.remindOnDate")}</SectionLabel>
                <TextInput
                  id="schedule-once-date"
                  type="date"
                  value={isoToYmd(schedule.once_at)}
                  min={todayYmd()}
                  onChange={(e) =>
                    onScheduleChange({ kind: "once", once_at: localYmdToIso(e.target.value) })
                  }
                  className="mt-1 tabular-nums"
                />
              </label>
            </div>
          ) : null}

          {/* Berulang → interval chips */}
          {schedule && schedule.kind !== "once" ? (
            <>
              <div>
                <SectionLabel>{t("reminderPage.timeInterval")}</SectionLabel>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(
                    [
                      { k: "daily", label: t("reminderPage.everyDay") },
                      { k: "weekly", label: t("reminderPage.everyWeek") },
                      { k: "monthly", label: t("reminderPage.everyMonth") },
                    ] as const
                  ).map(({ k, label }) => {
                    const active = schedule.kind === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onKindPick(k)}
                        className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                        aria-pressed={active}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weekly → multi-select hari */}
              {schedule.kind === "weekly" ? (
                <div>
                  <SectionLabel>{t("reminderPage.pickWeekdays")}</SectionLabel>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {WEEKDAYS.map((w) => {
                      const active = schedule.weekdays.includes(w.value);
                      return (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? schedule.weekdays.filter((d) => d !== w.value)
                              : [...schedule.weekdays, w.value];
                            onScheduleChange({ kind: "weekly", weekdays: next });
                          }}
                          className={`${CHIP_BASE} ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                          aria-pressed={active}
                          aria-label={t(w.longKey)}
                        >
                          {t(w.shortKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Monthly → day of month */}
              {schedule.kind === "monthly" ? (
                <div>
                  <label htmlFor="schedule-dom" className="block">
                    <SectionLabel as="span">{t("reminderPage.dayOfMonth")}</SectionLabel>
                    <TextInput
                      id="schedule-dom"
                      type="number"
                      min={1}
                      max={31}
                      value={schedule.day_of_month || ""}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        onScheduleChange({
                          kind: "monthly",
                          day_of_month: Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : 1,
                        });
                      }}
                      className="mt-1 w-24 tabular-nums font-semibold"
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-(--color-text-muted)">
                    {t("reminderPage.shortMonthHint")}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Auto / Manual segmented control
 *
 * Used by both KmField and ScheduleField when a "by system" suggestion is
 * available. Visually a thin pill row with two segments — kept compact so
 * it doesn't dominate the field card. We deliberately keep it inline (not
 * a separate file) because it's tightly coupled to the form layout
 * tokens used here.
 * ──────────────────────────────────────────────────────────────── */

function ModeSegment({
  mode,
  onChange,
  autoLabel,
  manualLabel,
}: {
  mode: "auto" | "manual";
  onChange: (next: "auto" | "manual") => void;
  autoLabel: string;
  manualLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t("reminderPage.valueSourceAria")}
      className="mt-2 inline-flex rounded-full border border-(--color-border)/60 bg-(--color-surface) p-0.5 text-[11px] font-semibold"
    >
      {(
        [
          { v: "auto" as const, label: autoLabel },
          { v: "manual" as const, label: manualLabel },
        ]
      ).map(({ v, label }) => {
        const active = mode === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v)}
            className={`rounded-full px-2.5 py-1 transition-all duration-150 ${
              active
                ? "bg-(--color-primary) text-(--color-bg) shadow-sm"
                : "text-(--color-text-secondary) hover:text-(--color-text)"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Source indicator dot — primary color when from real history, neutral when
 *  fallback. Tiny visual cue so user can tell at a glance whether the
 *  number is data-driven or just an estimate. */
function SystemDot({ source }: { source: "history" | "fallback" | "none" }) {
  // Source dot — mode-aware:
  //   history  = --color-primary (blue di color mode, dark neutral di grayscale)
  //   fallback = --zone-warn (amber semantic di color mode, mid opacity di grayscale)
  //   none     = muted (informational, no urgency)
  const cls =
    source === "history"
      ? "bg-(--color-primary)"
      : source === "fallback"
        ? "bg-(--zone-warn)"
        : "bg-(--color-text-muted)";
  return <span aria-hidden className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

function ToggleHeader({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      className="flex w-full items-center justify-between gap-3 text-left active:scale-[0.99]"
    >
      <p
        className={`text-sm font-semibold ${
          enabled ? "text-(--color-primary)" : "text-(--color-text)"
        }`}
      >
        {label}
      </p>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
          enabled
            ? "border-(--color-primary) bg-(--color-primary) text-(--color-bg)"
            : "border-(--color-border) bg-(--color-surface)"
        }`}
        aria-hidden
      >
        {enabled ? <CheckIcon className="h-3.5 w-3.5" /> : null}
      </span>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Empty state
 * ──────────────────────────────────────────────────────────────── */

function EmptyReminderCTA({ onClick, hidden }: { onClick: () => void; hidden: boolean }) {
  const { t } = useTranslation();
  if (hidden) return null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-1 py-6 sm:py-10">
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full max-w-[280px] flex-col items-center rounded-[1.75rem] border border-(--color-border) bg-(--color-surface) p-6 pb-7 text-center shadow-sm ring-1 ring-black/[0.03] transition-all hover:border-(--color-primary)/35 hover:shadow-md hover:ring-(--color-primary)/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg) active:scale-[0.98] dark:ring-white/[0.04]"
        aria-label={t("reminderPage.emptyAria")}
      >
        <div className="mb-5 flex h-[7.25rem] w-full max-w-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-(--color-primary)/35 bg-(--color-primary-soft) transition-colors group-hover:border-(--color-primary)/55 group-hover:bg-(--color-primary)/15">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-(--color-primary) text-(--color-bg) shadow-lg shadow-(--color-primary)/35 transition-transform group-hover:scale-105 group-active:scale-95">
            <PlusIcon className="h-11 w-11" />
          </div>
        </div>
        <h2 className="text-lg font-bold tracking-tight text-(--color-text)">
          {t("reminderPage.emptyTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-(--color-text-secondary)">
          {t("reminderPage.emptySubtitle")}
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-primary)">
          <span className="rounded-lg bg-(--color-primary-soft) px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-(--color-primary)">
            {t("reminderPage.emptyCta")}
          </span>
        </span>
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Icons
 * ──────────────────────────────────────────────────────────────── */

function BackArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.296a1 1 0 010 1.408l-7.5 7.5a1 1 0 01-1.408 0l-3.5-3.5a1 1 0 111.408-1.408L8.5 12.092l6.796-6.796a1 1 0 011.408 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}

