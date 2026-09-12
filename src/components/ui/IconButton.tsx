"use client";

/**
 * IconButton — circular button untuk icon-only actions.
 *
 * Wajib `label` (aria-label) karena tidak ada visible text. Variants:
 *  - `ghost`  — transparent, hover fills — untuk close X, more/menu, etc.
 *  - `solid`  — filled soft — kalau butuh lebih prominent (rare).
 *
 * Icon di-pass sebagai `children`. Ukuran icon auto-scale sesuai `size`,
 * tapi caller boleh override lewat `className` icon-nya sendiri.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonSize = "sm" | "md" | "lg";
type IconButtonVariant = "ghost" | "solid";

export type IconButtonProps = {
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">;

const SIZES: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost:
    "bg-transparent text-(--color-text-muted) hover:bg-(--color-surface-alt) hover:text-(--color-text)",
  solid:
    "bg-(--color-surface-alt) text-(--color-text) hover:bg-(--color-surface)",
};

export default function IconButton({
  label,
  size = "md",
  variant = "ghost",
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      disabled={disabled}
      className={`inline-flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
