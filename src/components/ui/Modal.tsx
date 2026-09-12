"use client";

/**
 * Modal — shared portal shell untuk bottom sheet / centered dialog.
 *
 * Handles:
 *  - Portal ke `document.body` (bypass parent `overflow-x-clip` stacking).
 *  - Backdrop klik → close (kalau `dismissible`).
 *  - Escape key → close (kalau `dismissible`).
 *  - Body scroll lock selama modal terbuka.
 *  - Drag handle di variant sheet (mobile affordance).
 *  - Drag-to-dismiss gesture (opt-in via `enableDragToDismiss`, sheet only):
 *      • Swipe down > 100px → slide out + close.
 *      • Swipe up → rubber-band resistance (iOS-ish).
 *      • Snap back kalau tidak melewati threshold.
 *      • Interactive descendant (button/a/input/etc) tidak trigger drag —
 *        supaya taps pada elemen di dalam sheet tetap responsive.
 *      • Constraint: pakai `touch-none` → mencegah native scroll dalam sheet.
 *        Hanya cocok untuk sheet dengan content pendek (tidak scrollable).
 *  - `rounded-3xl` corners consistent dengan login-tone.
 *  - Focus management:
 *      • On open: focus first focusable element di dalam content (fallback ke
 *        container div supaya screen reader tetap bisa "read" dialog title).
 *      • On close: restore focus ke element yang aktif sebelum modal dibuka
 *        (bukan hardcoded document.body — supaya user kembali ke trigger).
 *
 * Tidak handle:
 *  - Content — sepenuhnya di-compose oleh caller. Modal cuma shell.
 *  - Focus TRAP (Tab/Shift+Tab cycling within modal) — tidak di-implement karena
 *    kebanyakan modal kita cuma punya 2-3 focusable elements; browser default
 *    Tab behavior sudah cukup. Kalau nanti butuh, tambah trap logic di sini.
 *
 * A11y: `role="dialog"`, `aria-modal`, dan optional `aria-labelledby` /
 * `aria-busy` (untuk operasi async).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/lib/i18n";

/** Drag-to-dismiss constants (matches iOS bottom-sheet feel). */
const DRAG_DISMISS_THRESHOLD_PX = 100;
const DRAG_ANIMATION_MS = 220;
const DRAG_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
/** Selector untuk element interaktif — jangan trigger drag di atas element ini. */
const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role='button'], [role='switch'], [role='menuitem']";

/**
 * CSS selector untuk mendapatkan first focusable element di dalam modal.
 * Cover: interactive elements yang tidak disabled dan tidak tabindex=-1.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

type ModalVariant = "sheet" | "centered";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  variant?: ModalVariant;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  ariaBusy?: boolean;
  /** Kalau false, backdrop click & Escape TIDAK menutup (mis. saat saving). */
  dismissible?: boolean;
  /** Ekstra class utility di container content. */
  contentClassName?: string;
  /** Max width — default `max-w-md` (matches AddMileageModal). */
  maxWidthClass?: string;
  /**
   * Enable drag-to-dismiss gesture (sheet variant only). Kalau true, content
   * sheet akan mendapat `touch-none` yang mencegah native scroll — hanya cocok
   * untuk sheet pendek. Default false.
   */
  enableDragToDismiss?: boolean;
  children: ReactNode;
};

export default function Modal({
  open,
  onClose,
  variant = "sheet",
  ariaLabelledBy,
  ariaLabel,
  ariaBusy = false,
  dismissible = true,
  contentClassName,
  maxWidthClass = "max-w-md",
  enableDragToDismiss = false,
  children,
}: ModalProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  const isSheet = variant === "sheet";
  const dragEnabled = enableDragToDismiss && isSheet && dismissible;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, dismissible, onClose]);

  /**
   * Focus management: pindah focus INTO modal saat dibuka, restore saat
   * ditutup. Simpan reference ke previously-focused element via useRef supaya
   * survive re-renders.
   *
   * Timing: `requestAnimationFrame` supaya portal children sudah di-mount ke
   * DOM sebelum `querySelector` dijalankan (jaga2 kalau ada race condition
   * dengan React commit).
   */
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !mounted) return;
    // Simpan element yang aktif sekarang (biasanya = trigger button).
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const raf = requestAnimationFrame(() => {
      const container = contentRef.current;
      if (!container) return;
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      // Fallback ke container div (tabindex=-1 supaya bisa di-focus) kalau
      // tidak ada focusable child — supaya screen reader tetap masuk ke
      // dialog context.
      if (first) {
        first.focus();
      } else {
        container.focus();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      // Restore focus ke element sebelumnya. Guard `contains(document.body)`
      // supaya tidak crash kalau trigger element sudah unmounted (mis. baru
      // saja di-delete dari list).
      const prev = previouslyFocusedRef.current;
      if (prev && document.body.contains(prev)) {
        prev.focus();
      }
      previouslyFocusedRef.current = null;
    };
  }, [open, mounted]);

  /**
   * Drag-to-dismiss handlers. Manipulasi transform langsung via style
   * (bukan React state) supaya smooth di 60fps — setiap pointermove tidak
   * memicu re-render.
   */
  const applyDragTransform = (y: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate
      ? `transform ${DRAG_ANIMATION_MS}ms ${DRAG_EASING}`
      : "none";
    el.style.transform = y === 0 ? "" : `translateY(${y}px)`;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragEnabled) return;
    // Jangan aktifkan drag kalau tap dimulai di elemen interaktif — biar
    // taps pada tombol di dalam sheet tetap responsive.
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    dragStartY.current = e.clientY;
    applyDragTransform(0, false); // batalkan snap-back yang mungkin sedang jalan
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer sudah ter-release oleh browser — abaikan */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    // Rubber-band ke atas: kasih feedback bahwa arah UP tidak dismissable.
    const y = delta < 0 ? -Math.min(40, Math.sqrt(-delta) * 5) : delta;
    applyDragTransform(y, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    dragStartY.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (delta > DRAG_DISMISS_THRESHOLD_PX) {
      // Slide out ke bawah dulu, baru onClose. Kalau langsung onClose,
      // sheet menghilang tanpa animasi (jelek untuk swipe-down).
      applyDragTransform(window.innerHeight, true);
      window.setTimeout(onClose, DRAG_ANIMATION_MS);
    } else {
      // Snap back ke posisi asal.
      applyDragTransform(0, true);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex ${
        isSheet
          ? "items-end justify-center sm:items-center"
          : "items-center justify-center px-4"
      }`}
      role="dialog"
      aria-modal="true"
      aria-busy={ariaBusy || undefined}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 transition-opacity duration-150 hover:bg-black/45 disabled:hover:bg-black/40"
        aria-label={t("common.closeDialog")}
        disabled={!dismissible}
        onClick={() => {
          if (dismissible) onClose();
        }}
      />
      <div
        ref={contentRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={dragEnabled ? handlePointerDown : undefined}
        onPointerMove={dragEnabled ? handlePointerMove : undefined}
        onPointerUp={dragEnabled ? handlePointerUp : undefined}
        onPointerCancel={dragEnabled ? handlePointerUp : undefined}
        className={`relative z-10 flex w-full ${maxWidthClass} flex-col bg-(--color-bg) shadow-2xl outline-none ${
          isSheet
            ? "rounded-t-3xl sm:mx-4 sm:rounded-3xl"
            : "rounded-3xl"
        }${dragEnabled ? " touch-none will-change-transform" : ""}${contentClassName ? ` ${contentClassName}` : ""}`}
      >
        {isSheet ? (
          <div
            className={`flex justify-center pt-3 sm:hidden${dragEnabled ? " cursor-grab active:cursor-grabbing" : ""}`}
            aria-hidden
          >
            <div className="h-1 w-10 rounded-full bg-(--color-border)" />
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
