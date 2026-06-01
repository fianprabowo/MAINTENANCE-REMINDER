"use client";

import Link from "next/link";
import { toast } from "sonner";
import type { AppNotification } from "@/lib/types";

/* ──────────────────────────────────────────────────────────────────
 * Unread notifications first-load toast.
 *
 * Design intent (per latest UX iteration):
 *   • The whole card is the action — tapping anywhere navigates to
 *     `/notifications`. No CTA button, no "Nanti saja", no close X.
 *   • Dismissal is gestural (swipe up/left/right), enabled at the
 *     `<Toaster>` level. A subtle grab-handle at the top hints this.
 *   • Copy is minimal — headline + latest title. No body preview, no
 *     marketing voice.
 *   • Visuals: animated bell, color-coded accent bar (red for urgent,
 *     amber otherwise), one-shot halo pulse for polish.
 *
 * Sonner's pointer drag detection is stable enough that a single tap
 * still fires the link click — the swipe threshold is well above what
 * a tap produces.
 * ──────────────────────────────────────────────────────────────── */

type Tone = {
  /** Left accent bar color. */
  bar: string;
  /** Icon container background + text color. */
  iconWrap: string;
  /** Halo gradient stops used for the radial-glow background. */
  halo: string;
};

function pickTone(latest: AppNotification | null, totalUnread: number): Tone {
  // Urgent if the freshest item is overdue OR the inbox is piling up
  // (proxy for "probably has at least one overdue"). Tuned to err on the
  // calmer side — we'd rather under-alert than make users dread the toast.
  const urgent =
    latest?.kind === "reminder_terlewat" || totalUnread >= 3;
  if (urgent) {
    return {
      bar: "bg-gradient-to-b from-red-500 via-red-500 to-red-600",
      iconWrap: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300",
      halo: "from-red-400/40 via-red-400/10 to-transparent",
    };
  }
  return {
    bar: "bg-gradient-to-b from-amber-400 via-amber-500 to-amber-500",
    iconWrap: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    halo: "from-amber-400/40 via-amber-400/10 to-transparent",
  };
}

function headline(count: number): string {
  if (count === 1) return "1 pengingat baru";
  if (count <= 9) return `${count} pengingat baru`;
  return `${count} pengingat`;
}

export type UnreadToastPayload = {
  count: number;
  latest: AppNotification | null;
};

/**
 * Pure presentational. The outer `<Link>` is what handles taps; sonner
 * intercepts pointer drags before they reach the link's click handler,
 * so swipe-to-dismiss and tap-to-open coexist without conflict.
 */
export function UnreadNotificationsCard({
  count,
  latest,
  toastId,
}: UnreadToastPayload & { toastId: string | number }) {
  const tone = pickTone(latest, count);
  const title = headline(count);

  return (
    <Link
      href="/notifications"
      onClick={() => toast.dismiss(toastId)}
      role="alert"
      aria-label={
        latest
          ? `${title}. Terbaru: ${latest.title}. Tap untuk buka, geser untuk tutup.`
          : `${title}. Tap untuk buka, geser untuk tutup.`
      }
      className="relative block w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-(--color-border)/60 bg-(--color-surface) shadow-2xl backdrop-blur transition-transform active:scale-[0.99]"
    >
      {/* Top grab-handle hint — non-functional, purely a swipe affordance.
          Subtle enough not to dominate the card. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-(--color-border)"
      />

      {/* Left accent bar */}
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1.5 ${tone.bar}`}
      />

      {/* Soft radial halo behind the icon — one-shot via .toast-halo */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -left-2 -top-2 h-24 w-24 rounded-full bg-gradient-radial ${tone.halo} blur-2xl toast-halo`}
        style={{
          backgroundImage: `radial-gradient(circle, var(--tw-gradient-stops))`,
        }}
      />

      <div className="relative flex items-center gap-3 px-4 pb-3.5 pl-5 pt-4">
        {/* Animated bell */}
        <div
          aria-hidden
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrap}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 bell-swing"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </div>

        {/* Two-line block: headline + latest title (or empty placeholder
            line so the card height is stable across "with/without latest"). */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-(--color-text)">
            {title}
          </p>
          {latest ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-(--color-text-secondary)">
              {latest.title}
            </p>
          ) : null}
        </div>

        {/* Trailing chevron — the only visual that hints "this opens" */}
        <svg
          aria-hidden
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-(--color-text-muted)"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}

/**
 * Imperative helper used by the runner. Wraps `toast.custom()` so callers
 * don't need to know sonner internals.
 */
export function showUnreadNotificationsToast(payload: UnreadToastPayload): void {
  toast.custom(
    (id) => (
      <UnreadNotificationsCard
        count={payload.count}
        latest={payload.latest}
        toastId={id}
      />
    ),
    {
      duration: 10_000,
      // Strip sonner's default container styles — we own the visuals.
      unstyled: true,
    },
  );
}
