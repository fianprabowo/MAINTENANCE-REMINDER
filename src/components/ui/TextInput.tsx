"use client";

/**
 * TextInput — pill-shape input primitive (login-page tone).
 *
 * Design:
 *  - `h-14 rounded-full` — same shape as login page inputs.
 *  - `bg-(--color-surface-alt)` — subtle contrast dengan page bg.
 *  - Icon slots kiri/kanan → `pl-14`/`pr-14` otomatis kalau icon disediakan.
 *  - Error state: dark neutral border + wider stroke (grayscale mode). Focus
 *    state: subtle border via `--color-text/20`. Distinguishability dari
 *    invalid vs default = via border WEIGHT, bukan hue.
 *  - `<input>` di globals.css sudah punya default `background-color: var(--color-bg)`,
 *    kita override secara eksplisit di sini dengan class utility.
 *
 * A11y: `ref` di-forward (React 19 pattern), semua props HTML input di-passthrough.
 */

import type { InputHTMLAttributes, ReactNode, Ref } from "react";

export type TextInputProps = {
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
  error?: boolean;
  ref?: Ref<HTMLInputElement>;
} & InputHTMLAttributes<HTMLInputElement>;

export default function TextInput({
  leadingIcon,
  trailingSlot,
  error,
  className,
  ref,
  disabled,
  ...rest
}: TextInputProps) {
  const hasLeading = Boolean(leadingIcon);
  const hasTrailing = Boolean(trailingSlot);

  return (
    <div className="relative">
      {hasLeading ? (
        <div
          className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-(--color-text-muted)"
          aria-hidden
        >
          {leadingIcon}
        </div>
      ) : null}

      {/* `bg-(--color-surface-alt)` overrides globals.css `@layer base` input
          bg — Tailwind utilities are `@layer utilities` (higher specificity),
          so no `!important` needed. */}
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={error || undefined}
        className={`h-14 w-full rounded-full border bg-(--color-surface-alt) text-sm outline-none transition-colors placeholder:text-(--color-text-muted) disabled:opacity-60 ${
          hasLeading ? "pl-14" : "pl-5"
        } ${hasTrailing ? "pr-14" : "pr-5"        } ${
          error
            ? "border-(--color-text) ring-2 ring-(--color-text)/25 focus:border-(--color-text)"
            : "border-transparent focus:border-(--color-text)/20"
        }${className ? ` ${className}` : ""}`}
        {...rest}
      />

      {hasTrailing ? (
        <div className="absolute inset-y-0 right-3 my-auto flex h-9 items-center justify-center">
          {trailingSlot}
        </div>
      ) : null}
    </div>
  );
}
