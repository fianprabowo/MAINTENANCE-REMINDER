import Link from "next/link";
import type { ReactNode } from "react";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

interface EmptyVehicleStateProps {
  /**
   * Optional helper copy rendered below the CTA card. Useful for context-
   * specific hints (e.g. dashboard explains the bottom-bar KM shortcut).
   * Pass `null`/omit on screens where extra copy would feel noisy.
   */
  footnote?: ReactNode;
  /** Override heading. Defaults to "No vehicles yet". */
  title?: string;
  /** Override description copy. */
  description?: string;
  /** Override the small CTA badge label. */
  ctaLabel?: string;
  /**
   * Optional aria-label for the underlying link. Defaults to title.
   */
  ariaLabel?: string;
}

/**
 * Shared empty state for screens that depend on at least one vehicle.
 *
 * Wrap this component in a parent that provides vertical space for it
 * (e.g. `flex min-h-screen flex-col` → `flex flex-1`) so the inner
 * `flex-1 justify-center` actually centers within the viewport instead of
 * hugging the top of an unsized container.
 */
export default function EmptyVehicleState({
  footnote,
  title = "No vehicles yet",
  description = "Add a vehicle to track mileage, fuel, and service reminders in one place.",
  ctaLabel = "Tap to add",
  ariaLabel,
}: EmptyVehicleStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-1 py-6 sm:py-10">
      <Link
        href="/vehicles/add"
        className="group flex w-full max-w-[280px] flex-col items-center rounded-[1.75rem] border border-(--color-border) bg-(--color-surface) p-6 pb-7 text-center shadow-sm ring-1 ring-black/[0.03] transition-all hover:border-(--color-primary)/35 hover:shadow-md hover:ring-(--color-primary)/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg) active:scale-[0.98] dark:ring-white/[0.04]"
        aria-label={ariaLabel ?? title}
      >
        <div className="mb-5 flex h-[7.25rem] w-full max-w-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-(--color-primary)/35 bg-(--color-primary-soft) transition-colors group-hover:border-(--color-primary)/55 group-hover:bg-(--color-primary)/15">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-(--color-primary) text-white shadow-lg shadow-(--color-primary)/35 transition-transform group-hover:scale-105 group-active:scale-95">
            <PlusIcon className="h-11 w-11" />
          </div>
        </div>
        <h2 className="text-lg font-bold tracking-tight text-(--color-text)">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-(--color-text-secondary)">{description}</p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-primary)">
          <span className="rounded-lg bg-(--color-primary-soft) px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-(--color-primary)">
            {ctaLabel}
          </span>
        </span>
      </Link>
      {footnote ? (
        <div className="mt-6 max-w-[260px] text-center text-xs text-(--color-text-muted)">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}
