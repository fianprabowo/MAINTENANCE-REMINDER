"use client";

/**
 * ConfirmDialog — 2-button confirmation dialog (Cancel + Confirm/Destroy).
 *
 * Refactor untuk pakai design-system primitives (`Modal`, `Button`) supaya
 * konsisten dengan login-page tone: pill buttons, rounded-3xl container,
 * dark primary CTA. Sebelumnya pakai native `<dialog>` element; pindah ke
 * portal-based `Modal` supaya:
 *  - Behavior konsisten dengan AddMileageModal & modal lain di project.
 *  - Backdrop click handling terpusat (tidak perlu `getBoundingClientRect`
 *    workaround per-file).
 *  - Rendering keluar dari `overflow-x-clip` wrapper di layout.
 *
 * `variant="danger"` → tombol Confirm pakai `destructive` variant (grayscale
 * mode: dark filled + ring untuk emphasis, hover brightness-95 supaya
 * affordance "step back"). Sebelumnya merah; safeguard sekarang murni
 * datang dari two-step flow (Cancel vs Delete side-by-side) + wording
 * eksplisit di title/message.
 */

import { Button, Modal } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

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
  confirmLabel,
  cancelLabel,
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t("common.confirm");
  const resolvedCancelLabel = cancelLabel ?? t("common.cancel");
  const isDanger = variant === "danger";

  return (
    <Modal
      open={open}
      onClose={onCancel}
      variant="centered"
      maxWidthClass="max-w-sm"
      ariaLabelledBy="confirm-dialog-title"
    >
      <div className="p-6">
        <h3 id="confirm-dialog-title" className="text-lg font-bold text-(--color-text)">
          {title}
        </h3>
        <p className="mt-2 text-sm text-(--color-text-secondary)">{message}</p>

        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={onCancel}
          >
            {resolvedCancelLabel}
          </Button>
          <Button
            variant={isDanger ? "destructive" : "primary"}
            size="md"
            fullWidth
            onClick={onConfirm}
          >
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
