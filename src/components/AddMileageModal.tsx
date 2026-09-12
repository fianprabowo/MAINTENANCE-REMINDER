"use client";

/**
 * AddMileageModal — bottom-sheet untuk input KM baru.
 *
 * Refactor untuk pakai design-system primitives (`Modal`, `Button`,
 * `IconButton`, `TextInput`) supaya tampilan match login-page tone:
 *  - Pill-shape input (`h-14 rounded-full`).
 *  - Dark primary CTA (`Button variant="primary"`).
 *  - Circular close button di header.
 *
 * Business logic tidak berubah:
 *  - Digit-only input dengan max 9 chars.
 *  - Validasi: KM baru harus > minMileage (atau > 0 kalau minMileage=0).
 *  - Shake animation pada error (kelas `input-err-shake` di globals.css).
 *  - Saving overlay dengan spinner + hint text.
 *  - Odometer scan button di-embed langsung (integration with OCR flow).
 */

import { useEffect, useRef, useState } from "react";
import OdometerScanButton from "@/components/OdometerScanButton";
import { Button, IconButton, Modal, TextInput } from "@/components/ui";
import { insertMileage } from "@/lib/supabase";
import { toast } from "sonner";
import { useAppErrorMessage, useTranslation } from "@/lib/i18n";

/** Icon inline (bukan dari lucide) supaya bundle tetap kecil. */
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

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
  const resolvedTitle = title ?? t("addMileage.title");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      ariaLabelledBy="add-mileage-title"
      ariaBusy={saving}
      dismissible={!saving}
    >
      {/* Saving overlay — blur + spinner supaya user tahu ada operasi async
          berjalan, sekaligus block interaction pada form di bawahnya. */}
      {saving ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-t-3xl bg-(--color-bg)/92 backdrop-blur-[2px] sm:rounded-3xl dark:bg-black/55"
          aria-live="polite"
          aria-label={t("addMileage.saving")}
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)"
            aria-hidden
          />
          <p className="text-sm font-semibold text-(--color-text)">
            {t("addMileage.saving")}
          </p>
          <p className="max-w-[220px] text-center text-xs text-(--color-text-secondary)">
            {t("addMileage.savingHint")}
          </p>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={handleSubmit}
        className={`space-y-4 px-5 pt-3 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:p-6 sm:pb-7 ${saving ? "pointer-events-none" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="add-mileage-title"
            className="min-w-0 flex-1 text-lg font-bold leading-tight text-(--color-text)"
          >
            {resolvedTitle}
          </h2>
          <IconButton
            label={t("addMileage.close")}
            onClick={onClose}
            disabled={saving}
            className="-mr-1 -mt-1"
          >
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <p className="text-sm text-(--color-text-secondary)">
          {minMileage > 0
            ? t("addMileage.hintGreaterThan", { km: formatNumber(minMileage) })
            : t("addMileage.hintEmpty")}
        </p>

        <TextInput
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => setKmDigits(e.target.value)}
          onKeyDown={(e) => {
            // Whitelist navigation keys + digits; block everything else supaya
            // user tidak bisa paste huruf / spasi tanpa terlihat rejected.
            const nav = [
              "Backspace",
              "Delete",
              "Tab",
              "Escape",
              "Enter",
              "ArrowLeft",
              "ArrowRight",
              "Home",
              "End",
            ];
            if (nav.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
            if (/^\d$/.test(e.key)) return;
            e.preventDefault();
          }}
          disabled={saving}
          error={fieldError}
          className={shaking ? "input-err-shake" : ""}
          placeholder={t("addMileage.inputPlaceholder")}
          autoFocus
        />

        <OdometerScanButton
          variant="full"
          disabled={saving}
          onDetected={setKmDigits}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          disabled={saving}
        >
          {saving ? t("addMileage.submitting") : t("addMileage.submit")}
        </Button>
      </form>
    </Modal>
  );
}
