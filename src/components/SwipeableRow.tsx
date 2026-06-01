"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SwipeableRow — reveals a destructive action button when the user swipes
 * left on the row. Uses the unified Pointer Events API so a single handler
 * works for touch, mouse, and pen input. Vertical scrolling is preserved
 * because we set `touch-action: pan-y` on the foreground layer.
 *
 * Design notes:
 * - The action button lives behind the card and is gradually exposed via a
 *   `translateX` transform on the foreground. We never re-mount the action
 *   so its tap target is always present (no layout thrash).
 * - The "open" state can be controlled (parent decides) or uncontrolled.
 *   The Overview page lifts `openId` so only one row is open at a time —
 *   matches mobile OS conventions (iOS Mail, Gmail, etc.).
 * - We suppress the click that follows a real swipe (>6px movement) so the
 *   user doesn't accidentally trigger the underlying card tap when they
 *   just wanted to swipe.
 */

const ACTION_WIDTH_PX = 92;
const SWIPE_OPEN_THRESHOLD_PX = 56;
const TAP_MOVE_TOLERANCE_PX = 6;

interface SwipeableRowProps {
  children: React.ReactNode;
  /** Called when the user taps the revealed action button. */
  onAction: () => void;
  /** Controlled open state. When true, row is slid open. */
  isOpen: boolean;
  /** Notifies parent so it can close other rows when this one opens. */
  onOpenChange: (open: boolean) => void;
  /** Disable the gesture entirely (e.g. while a delete is in flight). */
  disabled?: boolean;
  /** Custom action button label. Defaults to "Hapus". */
  actionLabel?: string;
}

export default function SwipeableRow({
  children,
  onAction,
  isOpen,
  onOpenChange,
  disabled = false,
  actionLabel = "Hapus",
}: SwipeableRowProps) {
  const [translateX, setTranslateX] = useState(isOpen ? -ACTION_WIDTH_PX : 0);
  const [dragging, setDragging] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const startTranslate = useRef(0);
  // Tracks whether this gesture moved enough to count as a swipe (vs a tap).
  // Read inside the click capture handler to suppress accidental taps.
  const movedRef = useRef(false);

  // Sync local translation with controlled `isOpen` prop. This handles the
  // "close all others when one opens" case — parent sets isOpen=false on the
  // previously-open row and we animate it shut.
  useEffect(() => {
    if (dragging) return;
    setTranslateX(isOpen ? -ACTION_WIDTH_PX : 0);
  }, [isOpen, dragging]);

  // Outside-tap dismissal. When the row is open, any pointerdown that lands
  // outside this row's bounds closes it. We use `pointerdown` (not `click`)
  // so the dismissal is immediate — feels much snappier on mobile and also
  // beats the timing of any subsequent click handlers on other cards.
  // Inside taps are intentionally NOT handled here: the existing
  // `handleClickCapture` already closes the row on tap, and the action
  // button's own onClick still fires reliably.
  useEffect(() => {
    if (!isOpen) return;
    const node = rootRef.current;
    if (!node) return;

    function handleOutsidePointerDown(e: PointerEvent) {
      if (!node) return;
      if (node.contains(e.target as Node)) return;
      onOpenChange(false);
    }

    // Listen on the capture phase so we run BEFORE other elements' handlers.
    // This closes the row "first" if the user taps another card or anywhere
    // else on the page, without interfering with the target's own click.
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [isOpen, onOpenChange]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    // Only respond to the primary pointer (left mouse button or first touch).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startTranslate.current = translateX;
    movedRef.current = false;
    setDragging(true);
    // Capture future pointer events on this element so we don't lose the
    // gesture if the pointer leaves the row mid-drag.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;

    if (!movedRef.current && Math.abs(delta) > TAP_MOVE_TOLERANCE_PX) {
      movedRef.current = true;
    }

    let next = startTranslate.current + delta;
    // Rubber-band: small overshoot beyond the natural bounds for tactile feel.
    if (next > 0) next = next * 0.3;
    if (next < -ACTION_WIDTH_PX) {
      const overshoot = next + ACTION_WIDTH_PX;
      next = -ACTION_WIDTH_PX + overshoot * 0.3;
    }
    setTranslateX(next);
  };

  const handlePointerUp = () => {
    if (startX.current === null) return;
    setDragging(false);
    startX.current = null;

    // Snap based on absolute position relative to the threshold, not the
    // delta — this way you can also swipe-right to close from any position.
    const shouldOpen = translateX < -SWIPE_OPEN_THRESHOLD_PX;
    setTranslateX(shouldOpen ? -ACTION_WIDTH_PX : 0);
    if (shouldOpen !== isOpen) onOpenChange(shouldOpen);
  };

  // Click capture: if the gesture moved past the tap tolerance OR if the row
  // is currently open, swallow the tap on the card. Tapping an open row is
  // interpreted as "close" instead of activating the underlying card.
  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
      return;
    }
    if (isOpen) {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    }
  };

  const handleAction = useCallback(() => {
    onAction();
  }, [onAction]);

  return (
    <div ref={rootRef} className="relative overflow-hidden rounded-2xl">
      {/* Action panel (rendered behind the card). It's always present so the
          tap target is stable; visibility is controlled by the foreground's
          translateX. We size it to ACTION_WIDTH_PX so the math lines up. */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: ACTION_WIDTH_PX }}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          onClick={handleAction}
          disabled={disabled || !isOpen}
          className="flex h-full w-full flex-col items-center justify-center gap-1 bg-red-500 text-xs font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
        >
          <TrashIcon className="h-5 w-5" />
          <span>{actionLabel}</span>
        </button>
      </div>

      {/* Foreground layer: the actual card content. We listen to pointer
          events here so the user grabs whatever they tap on the card. */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        style={{
          transform: `translate3d(${translateX}px, 0, 0)`,
          transition: dragging
            ? "none"
            : "transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)",
          // pan-y lets the browser handle vertical scroll natively while we
          // capture horizontal moves. Without this, scrolling on touch
          // devices feels glitchy because the row swallows the gesture.
          touchAction: "pan-y",
        }}
        className="relative z-[1]"
      >
        {children}
      </div>
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
