"use client";

import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Modal, SectionLabel, Spinner } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

export type ServiceNotaPhase = "idle" | "processing" | "success" | "error" | "empty";

type ServiceNotaHeroProps = {
  phase: ServiceNotaPhase;
  fileName?: string | null;
  itemCount?: number;
  detectedDateLabel?: string | null;
  detectedKmLabel?: string | null;
  estimatedTotalLabel?: string | null;
  errorMessage?: string | null;
  /** Ada nota tersimpan di Storage (mode edit), belum diganti file baru. */
  hasStoredReceipt?: boolean;
  disabled?: boolean;
  onPickFile: (file: File) => void;
  onClearFile: () => void;
  onRetry?: () => void;
};

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function ServiceNotaHero({
  phase,
  fileName,
  itemCount = 0,
  detectedDateLabel,
  detectedKmLabel,
  estimatedTotalLabel,
  errorMessage,
  hasStoredReceipt = false,
  disabled = false,
  onPickFile,
  onClearFile,
  onRetry,
}: ServiceNotaHeroProps) {
  const { t } = useTranslation();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Tutup popup saat OCR mulai / selesai sukses. */
  useEffect(() => {
    if (phase === "processing" || phase === "success") {
      setPickerOpen(false);
    }
  }, [phase]);

  const pick = (file: File | undefined) => {
    if (!file || disabled) return;
    setPickerOpen(false);
    onPickFile(file);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const busy = disabled || phase === "processing";
  const showStoredOnly = phase === "idle" && hasStoredReceipt && !fileName;

  const openPicker = () => {
    if (busy) return;
    setPickerOpen(true);
  };

  const fileInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={busy}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        disabled={busy}
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </>
  );

  return (
    <section className="shrink-0">
      {fileInputs}

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        variant="sheet"
        ariaLabelledBy="nota-upload-title"
        dismissible={!busy}
        maxWidthClass="max-w-md"
        contentClassName="p-5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="nota-upload-title" className="text-lg font-extrabold text-(--color-text)">
              {t("serviceNotaHero.uploadTitle")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-(--color-text-secondary)">
              {t("serviceNotaHero.uploadSubtitle")}
            </p>
          </div>
          <IconButton
            label={t("common.close")}
            onClick={() => setPickerOpen(false)}
            disabled={busy}
            className="-mr-1 -mt-1"
          >
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="mt-5 flex flex-col items-center rounded-2xl border-2 border-dashed border-(--color-primary)/40 bg-(--color-primary-soft)/30 px-4 py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-(--color-primary) text-(--color-bg) shadow-lg shadow-(--color-primary)/30">
            <FileIcon className="h-8 w-8" />
          </div>
          <p className="text-sm font-bold text-(--color-text)">{t("serviceNotaHero.pickSource")}</p>
          <p className="mt-1 text-[11px] text-(--color-text-secondary)">
            {t("serviceNotaHero.pickSourceHint")}
          </p>
          <div className="mt-5 grid w-full max-w-xs grid-cols-2 gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              fullWidth
              disabled={busy}
              leadingIcon={<CameraIcon className="h-4 w-4" />}
              onClick={() => cameraInputRef.current?.click()}
            >
              {t("serviceNotaHero.camera")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              fullWidth
              disabled={busy}
              leadingIcon={<FileIcon className="h-4 w-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("serviceNotaHero.photoPdf")}
            </Button>
          </div>
        </div>
      </Modal>

      {phase === "processing" ? (
        <div
          className="space-y-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/40"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3">
            <Spinner className="h-10 w-10 shrink-0 text-(--color-primary)" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-(--color-text)">{t("serviceNotaHero.processing")}</p>
              <p className="truncate text-xs text-(--color-text-secondary)">
                {fileName ?? t("serviceNotaHero.processingFile")}
              </p>
            </div>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-(--color-border)/50"
            role="progressbar"
            aria-label={t("serviceNotaHero.processingAria")}
          >
            <div className="progress-indeterminate h-full rounded-full bg-(--color-primary)" />
          </div>
        </div>
      ) : null}

      {phase === "success" && fileName ? (
        <div className="space-y-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/40">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-(--color-primary-soft) text-(--color-primary)">
              <CheckIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold tracking-tight text-(--color-text)">
                {t("serviceNotaHero.itemsDetected", { n: itemCount })}
              </p>
              <p className="mt-0.5 truncate text-xs font-medium text-(--color-text-secondary)">
                {fileName}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--color-text-secondary)">
                {detectedDateLabel ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    <SectionLabel as="span">{t("serviceNotaHero.dateLabel")}</SectionLabel>
                    <span className="font-semibold text-(--color-text)">{detectedDateLabel}</span>
                  </span>
                ) : null}
                {detectedKmLabel ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    <SectionLabel as="span">{t("serviceNotaHero.kmLabel")}</SectionLabel>
                    <span className="font-semibold tabular-nums text-(--color-text)">
                      {detectedKmLabel}
                    </span>
                  </span>
                ) : null}
                {estimatedTotalLabel ? (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    <SectionLabel as="span">{t("serviceNotaHero.estLabel")}</SectionLabel>
                    <span className="font-semibold tabular-nums text-(--color-primary)">
                      {estimatedTotalLabel}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            disabled={busy}
            onClick={openPicker}
          >
            {t("serviceNotaHero.replaceFile")}
          </Button>
        </div>
      ) : null}

      {(phase === "error" || phase === "empty") && (
        <div className="space-y-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/40">
          {/*
            Error / empty callout — grayscale mode: neutral inverted bg untuk
            "loud" tone (previously red-50 / red-950). Text-secondary di sub
            supaya body tidak terlalu heavy.
          */}
          <div className="rounded-xl bg-(--color-text) px-3 py-3">
            <p className="text-sm font-bold text-(--color-bg)">
              {phase === "empty" ? t("serviceNotaHero.emptyTitle") : t("serviceNotaHero.errorTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-(--color-bg)/80">
              {errorMessage ??
                (phase === "empty"
                  ? t("serviceNotaHero.emptyDefault")
                  : t("serviceNotaHero.errorDefault"))}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            fullWidth
            disabled={busy}
            onClick={() => {
              onClearFile();
              onRetry?.();
              openPicker();
            }}
          >
            {t("serviceNotaHero.retryUpload")}
          </Button>
        </div>
      )}

      {phase === "idle" ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={openPicker}
            className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-(--color-primary)/40 bg-(--color-primary-soft)/25 px-3 py-3 text-left transition-all hover:border-(--color-primary)/60 hover:bg-(--color-primary-soft)/45 active:scale-[0.99] disabled:opacity-50"
            aria-label={t("serviceNotaHero.scanAria")}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-primary) text-(--color-bg) shadow-md shadow-(--color-primary)/30 transition-transform group-hover:scale-105">
              <PlusIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-(--color-text)">{t("serviceNotaHero.scanTitle")}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-(--color-text-secondary)">
                {t("serviceNotaHero.scanHint")}
              </span>
            </span>
            <span className="shrink-0 text-(--color-primary)/70" aria-hidden>
              →
            </span>
          </button>
          {showStoredOnly ? (
            <p className="px-1 text-[11px] font-medium text-(--color-text-muted)">
              {t("serviceNotaHero.storedHint")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
