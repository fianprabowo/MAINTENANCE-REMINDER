"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** Tutup popup saat OCR mulai / selesai sukses. */
  useEffect(() => {
    if (phase === "processing" || phase === "success") {
      setPickerOpen(false);
    }
  }, [phase]);

  useEffect(() => {
    if (!pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

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

  const pickerPopup =
    mounted && pickerOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nota-upload-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              aria-label="Tutup"
              onClick={() => setPickerOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-(--color-bg) p-5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))] shadow-2xl sm:mx-4 sm:rounded-3xl">
              <div className="mb-1 flex justify-center sm:hidden" aria-hidden>
                <div className="h-1 w-10 rounded-full bg-(--color-border)" />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="nota-upload-title" className="text-lg font-extrabold text-(--color-text)">
                    Upload service receipt
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-(--color-text-secondary)">
                    Upload a service receipt and AI will automatically extract the service items,
                    quantity, prices and service date.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-(--color-text-muted) hover:bg-(--color-surface) hover:text-(--color-text)"
                  aria-label="Tutup"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-5 flex flex-col items-center rounded-2xl border-2 border-dashed border-(--color-primary)/40 bg-(--color-primary-soft)/30 px-4 py-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-(--color-primary) text-white shadow-lg shadow-(--color-primary)/30">
                  <FileIcon className="h-8 w-8" />
                </div>
                <p className="text-sm font-bold text-(--color-text)">Pilih sumber file</p>
                <p className="mt-1 text-[11px] text-(--color-text-secondary)">
                  Foto kamera atau file gambar / PDF
                </p>
                <div className="mt-5 grid w-full max-w-xs grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-(--color-primary) px-3 py-3.5 text-xs font-bold text-white shadow-md shadow-(--color-primary)/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                  >
                    <CameraIcon className="h-4 w-4" />
                    Camera
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-3.5 text-xs font-bold text-(--color-text) transition-all hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.98] disabled:opacity-50"
                  >
                    <FileIcon className="h-4 w-4" />
                    Photo / PDF
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <section className="shrink-0">
      {fileInputs}
      {pickerPopup}

      {phase === "processing" ? (
        <div
          className="space-y-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/40"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 shrink-0 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-(--color-text)">AI sedang membaca nota…</p>
              <p className="truncate text-xs text-(--color-text-secondary)">
                {fileName ?? "Memproses file"}
              </p>
            </div>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-(--color-border)/50"
            role="progressbar"
            aria-label="Memproses nota"
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
                {itemCount} service items detected
              </p>
              <p className="mt-0.5 truncate text-xs font-medium text-(--color-text-secondary)">
                {fileName}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--color-text-secondary)">
                {detectedDateLabel ? (
                  <span>
                    Date:{" "}
                    <span className="font-semibold text-(--color-text)">{detectedDateLabel}</span>
                  </span>
                ) : null}
                {detectedKmLabel ? (
                  <span>
                    KM:{" "}
                    <span className="font-semibold tabular-nums text-(--color-text)">
                      {detectedKmLabel}
                    </span>
                  </span>
                ) : null}
                {estimatedTotalLabel ? (
                  <span>
                    Est:{" "}
                    <span className="font-semibold tabular-nums text-(--color-primary)">
                      {estimatedTotalLabel}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={openPicker}
            className="w-full rounded-xl border border-(--color-border) bg-(--color-bg) py-2.5 text-xs font-bold text-(--color-text) transition-all hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.99] disabled:opacity-50"
          >
            Replace File
          </button>
        </div>
      ) : null}

      {(phase === "error" || phase === "empty") && (
        <div className="space-y-3 rounded-2xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/40">
          <div className="rounded-xl bg-red-50 px-3 py-3 dark:bg-red-950/25">
            <p className="text-sm font-bold text-red-600 dark:text-red-400">
              {phase === "empty" ? "No items detected" : "OCR failed"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-red-600/80 dark:text-red-300/80">
              {errorMessage ??
                (phase === "empty"
                  ? "AI tidak menemukan baris part di file ini. Coba foto lebih jelas atau isi manual."
                  : "Gagal membaca nota. Pastikan file jelas, lalu coba lagi.")}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onClearFile();
              onRetry?.();
              openPicker();
            }}
            className="w-full rounded-xl bg-(--color-primary) py-2.5 text-xs font-bold text-white shadow-md shadow-(--color-primary)/25 active:scale-[0.99] disabled:opacity-50"
          >
            Coba upload lagi
          </button>
        </div>
      )}

      {phase === "idle" ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={openPicker}
            className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-(--color-primary)/40 bg-(--color-primary-soft)/25 px-3 py-3 text-left transition-all hover:border-(--color-primary)/60 hover:bg-(--color-primary-soft)/45 active:scale-[0.99] disabled:opacity-50"
            aria-label="Upload service receipt"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-primary) text-white shadow-md shadow-(--color-primary)/30 transition-transform group-hover:scale-105">
              <PlusIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-(--color-text)">Scan nota dengan AI</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-(--color-text-secondary)">
                Tap untuk foto atau upload PDF
              </span>
            </span>
            <span className="shrink-0 text-(--color-primary)/70" aria-hidden>
              →
            </span>
          </button>
          {showStoredOnly ? (
            <p className="px-1 text-[11px] font-medium text-(--color-text-muted)">
              Nota tersimpan — tap di atas untuk ganti &amp; scan ulang.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
