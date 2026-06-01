"use client";

import { useState } from "react";
import SwipeableRow from "@/components/SwipeableRow";
import type { MileageLog } from "@/lib/types";

/**
 * Render the mileage timeline with optional swipe-to-delete on each entry.
 *
 * Read-only mode (default): renders a plain timeline.
 * Editable mode: pass `onDelete` to enable per-row swipe gesture. The
 * caller is responsible for any side-effect orchestration (refresh,
 * confirm dialog, optimistic state) — this component just emits intent.
 *
 * Critical caveats the caller should know:
 *   - Deleting the LATEST entry will lower `vehicles.current_mileage_km`
 *     because the DB trigger recomputes max(mileage_logs). Reminders may
 *     flip status as a result.
 *   - We follow the same swipe pattern used in overview / reminder /
 *     notifications pages, including hoisting the open-id to the parent
 *     so only one row can be slid open at a time.
 */
interface HistoryTimelineProps {
  logs: MileageLog[];
  /** When provided, each row becomes swipeable to reveal a Hapus action. */
  onDelete?: (log: MileageLog) => void;
}

export default function HistoryTimeline({ logs, onDelete }: HistoryTimelineProps) {
  // openSwipeId hoisted here (single-instance) so opening one row closes
  // the others. Mirrors iOS Mail / Gmail behavior.
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  if (!logs || logs.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-3xl">📊</div>
        <p className="text-sm text-(--color-text-muted)">Belum ada riwayat KM.</p>
      </div>
    );
  }

  const editable = typeof onDelete === "function";

  return (
    <div className="space-y-1.5">
      {editable ? (
        <p className="text-[11px] text-(--color-text-muted)">
          Geser ke kiri untuk hapus.
        </p>
      ) : null}
      <div role="list" className="relative space-y-0">
        {/* Continuous spine — sits behind all rows. We use absolute so the
            line doesn't shift when a row is swiped. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-4 top-3 bottom-3 w-0.5 bg-(--color-border)"
        />
        {logs.map((log, idx) => {
          const row = (
            <div className="relative flex items-start gap-4 bg-(--color-bg) py-3 pl-10">
              <div
                aria-hidden
                className={`absolute left-2.5 top-4.5 h-3 w-3 rounded-full border-2 border-(--color-surface) ${
                  idx === 0 ? "bg-(--color-primary)" : "bg-(--color-border)"
                }`}
              />
              <div className="flex-1">
                <p className="font-bold text-(--color-text)">
                  {log.mileage.toLocaleString("id-ID")} KM
                </p>
                <p className="text-xs text-(--color-text-muted)">
                  {new Date(log.created_at).toLocaleDateString("id-ID", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );

          if (!editable) {
            return (
              <div role="listitem" key={log.id}>
                {row}
              </div>
            );
          }

          return (
            <div role="listitem" key={log.id}>
              <SwipeableRow
                isOpen={openSwipeId === log.id}
                onOpenChange={(open) => setOpenSwipeId(open ? log.id : null)}
                onAction={() => onDelete?.(log)}
              >
                {row}
              </SwipeableRow>
            </div>
          );
        })}
      </div>
    </div>
  );
}
