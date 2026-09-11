"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OdometerScanButton from "@/components/OdometerScanButton";
import { insertMileage } from "@/lib/supabase";
import { toast } from "sonner";
import { useAppErrorMessage, useTranslation } from "@/lib/i18n";

export type AddMileageModalProps = {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  /** Latest logged KM (new reading must be strictly greater). Use 0 if none. */
  minMileage: number;
  onSaved: () => void | Promise<void>;
  /** Dialog title */
  title?: string;
};

export default function AddMileageModal({
  open,
  onClose,
  vehicleId,
  minMileage,
  onSaved,
  title,
}: AddMileageModalProps) {
  const { t, formatNumber } = useTranslation();
  const describeAppError = useAppErrorMessage();
  // Default title berasal dari i18n; caller boleh tetap override
  // (mis. Vehicle Detail memakai copy sendiri).
  const resolvedTitle = title ?? t("addMileage.title");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [mounted, setMounted] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setValue("");
      setFieldError(false);
      setShaking(false);
    }
  }, [open, minMileage]);

  useEffect(() => {
    return () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    };
  }, []);

  /** Body scroll lock + Escape-to-close while the bottom sheet is open. */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, saving, onClose]);

  const triggerFieldError = () => {
    setFieldError(true);
    setShaking(true);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShaking(false), 450);
  };

  const setKmDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 9);
    setValue(digits);
    setFieldError(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    const n = parseInt(trimmed, 10);
    if (trimmed === "" || Number.isNaN(n) || n <= minMileage) {
      triggerFieldError();
      toast.error(
        minMileage > 0
          ? t("addMileage.mustBeGreater", { km: formatNumber(minMileage) })
          : t("addMileage.mustBeGreaterThanZero"),
      );
      return;
    }
    setSaving(true);
    try {
      await insertMileage(vehicleId, n);
      toast.success(t("addMileage.savedToast"));
      setFieldError(false);
      await Promise.resolve(onSaved());
      onClose();
    } catch (err) {
      toast.error(describeAppError(err, t("addMileage.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !mounted) return null;

  /**
   * Portal ke document.body — sheet di /vehicles di-render di dalam
   * wrapper layout `overflow-x-clip`, yang membuat containing block /
   * stacking context. Tanpa portal, `fixed` + z-50 kalah dari BottomNav
   * (juga z-50, sibling di luar wrapper).
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-busy={saving}
      aria-labelledby="add-mileage-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 transition-opacity duration-150 hover:bg-black/45"
        aria-label={t("addMileage.close")}
        disabled={saving}
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div
        className="relative z-10 flex w-full max-w-md flex-col rounded-t-3xl bg-(--color-bg) shadow-2xl sm:mx-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile bottom-sheet affordance */}
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-(--color-border)" />
        </div>

        {saving && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-t-3xl bg-(--color-bg)/92 backdrop-blur-[2px] sm:rounded-3xl dark:bg-black/55"
            aria-live="polite"
            aria-label={t("addMileage.saving")}
          >
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)"
              aria-hidden
            />
            <p className="text-sm font-semibold text-(--color-text)">{t("addMileage.saving")}</p>
            <p className="max-w-[220px] text-center text-xs text-(--color-text-secondary)">
              {t("addMileage.savingHint")}
            </p>
          </div>
        )}

        <form
          noValidate
          onSubmit={handleSubmit}
          className={`space-y-4 px-5 pt-3 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:p-6 sm:pb-7 ${saving ? "pointer-events-none" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="add-mileage-title" className="min-w-0 flex-1 text-lg font-bold leading-tight">
              {resolvedTitle}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label={t("addMileage.close")}
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-(--color-text-muted) transition-all duration-150 hover:bg-(--color-surface) hover:text-(--color-text) active:scale-95 disabled:opacity-40"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-(--color-text-secondary)">
            {minMileage > 0
              ? t("addMileage.hintGreaterThan", { km: formatNumber(minMileage) })
              : t("addMileage.hintEmpty")}
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            value={value}
            onChange={(e) => setKmDigits(e.target.value)}
            onKeyDown={(e) => {
              const nav = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
              if (nav.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
              if (/^\d$/.test(e.key)) return;
              e.preventDefault();
            }}
            disabled={saving}
            aria-invalid={fieldError}
            className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:ring-2 disabled:opacity-50 ${fieldError
                ? "border-red-500 bg-red-50/50 ring-2 ring-red-500/30 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500/80 dark:bg-red-950/20 dark:ring-red-500/35"
                : "border-(--color-border) focus:border-(--color-primary) focus:ring-(--color-primary)/20"
              } ${shaking ? "input-err-shake" : ""}`}
            placeholder={t("addMileage.inputPlaceholder")}
            autoFocus
          />
          <OdometerScanButton variant="full" disabled={saving} onDetected={setKmDigits} />
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-(--color-primary) py-3.5 text-sm font-bold text-white shadow-md shadow-(--color-primary)/30 transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {saving ? t("addMileage.submitting") : t("addMileage.submit")}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
