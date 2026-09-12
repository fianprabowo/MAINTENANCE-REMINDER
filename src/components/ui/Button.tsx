"use client";

/**
 * Button — primary interactive primitive, pill-shape (login-page tone).
 *
 * Design tokens:
 *  - Shape: `rounded-full` (pill) — consistent dengan login page CTA.
 *  - Height: sm=40, md=48, lg=56 → touch-friendly di mobile.
 *  - Variants:
 *     • `primary`   — dark filled (`bg-text text-bg`), untuk CTA utama.
 *     • `secondary` — soft filled, untuk aksi opsional / cancel.
 *     • `destructive` — same tone sebagai primary + `ring` untuk emphasis
 *        (grayscale mode). Safeguard bukan dari warna, tapi dari
 *        ConfirmDialog yang di-trigger caller. Sebelumnya merah.
 *     • `ghost`     — transparent, untuk aksi tersier / link-like.
 *  - Loading state: Spinner replaces leading icon, disable interaction.
 *  - Uppercase text NOT default — caller boleh tambah via className kalau
 *    mau match login page "loud CTA" style. Default sentence-case supaya
 *    dialog buttons ("Cancel", "Save") tidak terasa shouty.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Spinner from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    children: ReactNode;
  };

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all outline-none disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-(--color-text) text-(--color-bg) shadow-lg shadow-(--color-text)/15 hover:brightness-110",
  secondary:
    "bg-(--color-surface-alt) text-(--color-text) hover:bg-(--color-surface) border border-transparent hover:border-(--color-border)",
  /*
   * Destructive (grayscale mode): same "loud" filled tone sebagai primary
   * tapi dengan `ring` untuk emphasis + hover brightness turun (bukan naik)
   * supaya visual affordance = "step back". Safeguard utama = ConfirmDialog
   * yang di-trigger dari caller (bukan icon warna).
   *
   * Alasan tidak pakai red: user request full grayscale — semantic urgency
   * di-encode via UI pattern (dialog confirmation + wording explicit),
   * bukan hue. Tetap A11y-safe karena button LABEL sudah jelas.
   */
  destructive:
    "bg-(--color-text) text-(--color-bg) shadow-lg shadow-(--color-text)/25 ring-2 ring-(--color-text)/40 hover:brightness-95",
  ghost:
    "bg-transparent text-(--color-text) hover:bg-(--color-surface-alt)",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-10 px-5 text-xs",
  md: "h-12 px-6 text-sm",
  lg: "h-14 px-8 text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]}${fullWidth ? " w-full" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {loading ? (
        <Spinner className="h-5 w-5" />
      ) : leadingIcon ? (
        <span className="flex items-center" aria-hidden>
          {leadingIcon}
        </span>
      ) : null}
      <span className="min-w-0">{children}</span>
      {!loading && trailingIcon ? (
        <span className="flex items-center" aria-hidden>
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}
