"use client";

import { useEffect, useRef, useState } from "react";
import { insertMileage } from "@/lib/supabase";
import { toast } from "sonner";

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
  title = "Perbarui kilometer",
}: AddMileageModalProps) {
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
          ? `KM baru harus lebih besar dari ${minMileage.toLocaleString()}`
          : "Masukkan KM lebih besar dari 0",
      );
      return;
    }
    setSaving(true);
    try {
      await insertMileage(vehicleId, n);
      toast.success("KM tersimpan");
      setFieldError(false);
      await Promise.resolve(onSaved());
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan KM");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-0 items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-(--color-bg) p-6 pb-7 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-busy={saving}
        aria-labelledby="add-mileage-title"
        onClick={(e) => e.stopPropagation()}
      >
        {saving && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-(--color-bg)/92 backdrop-blur-[2px] dark:bg-black/55"
            aria-live="polite"
            aria-label="Menyimpan"
          >
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)"
              aria-hidden
            />
            <p className="text-sm font-semibold text-(--color-text)">Menyimpan…</p>
            <p className="max-w-[220px] text-center text-xs text-(--color-text-secondary)">
              Mohon tunggu, sedang menyimpan ke server.
            </p>
          </div>
        )}
        <form
          noValidate
          onSubmit={handleSubmit}
          className={`space-y-4 ${saving ? "pointer-events-none" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="add-mileage-title" className="min-w-0 flex-1 text-lg font-bold leading-tight">
              {title}
            </h2>
            {/* Close icon (X) — secondary action, sebelumnya tombol "Batal" di
                bawah. Pindah ke pojok sebagai close affordance standar modal. */}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Tutup"
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
            {minMileage > 0 ? (
              <>
                KM baru harus{" "}
                <span className="font-semibold text-(--color-text)">lebih besar</span> dari{" "}
                <span className="font-semibold text-(--color-text)">{minMileage.toLocaleString()} km</span>{" "}
                (KM terakhir tercatat).
              </>
            ) : (
              <>Masukkan odometer saat ini (harus lebih besar dari 0).</>
            )}
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
            className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:ring-2 disabled:opacity-50 ${
              fieldError
                ? "border-red-500 bg-red-50/50 ring-2 ring-red-500/30 focus:border-red-500 focus:ring-red-500/25 dark:border-red-500/80 dark:bg-red-950/20 dark:ring-red-500/35"
                : "border-(--color-border) focus:border-(--color-primary) focus:ring-(--color-primary)/20"
            } ${shaking ? "input-err-shake" : ""}`}
            placeholder="Odometer (km)"
            autoFocus
          />
          {/* Primary CTA — pola tombol Simpan standar app: --color-primary
              solid + shadow-(--color-primary)/30 + active:scale-95.
              Sebelumnya posisi ini dipakai untuk "Batal" — kini dijadikan
              tombol simpan utama supaya thumb-reach friendly di mobile. */}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-(--color-primary) py-3.5 text-sm font-bold text-white shadow-md shadow-(--color-primary)/30 transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </form>
      </div>
    </div>
  );
}
