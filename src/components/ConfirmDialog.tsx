"use client";

import { useCallback, useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  const isDanger = variant === "danger";

  /**
   * Backdrop dismiss. Native `<dialog>` mengirimkan click event ke dialog
   * itu sendiri (`e.target === dialog`) ketika user klik di area backdrop —
   * sedangkan klik di content akan target child element. Kita pakai
   * `getBoundingClientRect()` untuk verifikasi tambahan karena beberapa
   * browser inkonsisten saat dialog `display:flex`/grid.
   *
   * `onCancel` dipanggil agar konsumen bisa mem-block dismissal pada state
   * tertentu (mis. saat ada operasi async yang sedang berjalan — overview &
   * service-history sudah meng-guard dengan `if (deleting) return;`).
   */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      const dialog = dialogRef.current;
      if (!dialog || e.target !== dialog) return;

      const rect = dialog.getBoundingClientRect();
      const insideContent =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;

      if (!insideContent) onCancel();
    },
    [onCancel],
  );

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] m-auto w-[min(85vw,320px)] rounded-3xl border-none bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="rounded-3xl bg-(--color-surface) p-6 shadow-xl">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-2 text-sm text-(--color-text-secondary)">{message}</p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-(--color-surface-alt) py-3 text-sm font-semibold transition-colors hover:bg-(--color-border)"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-all hover:brightness-110 ${
              isDanger
                ? "bg-(--color-critical) shadow-md shadow-(--color-critical)/30"
                : "bg-(--color-primary) shadow-md shadow-(--color-primary)/30"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
