"use client";

import { useState } from "react";
import SwipeableRow from "@/components/SwipeableRow";
import { useTranslation } from "@/lib/i18n";
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
  const { t, formatNumber, formatDate } = useTranslation();
  // openSwipeId hoisted here (single-instance) so opening one row closes
  // the others. Mirrors iOS Mail / Gmail behavior.
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  if (!logs || logs.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-3xl">📊</div>
        <p className="text-sm text-(--color-text-muted)">{t("historyTimeline.empty")}</p>
      </div>
    );
  }

  const editable = typeof onDelete === "function";

  return (
    <div className="space-y-1.5">
      {editable ? (
        <p className="text-[11px] text-(--color-text-muted)">
          {t("historyTimeline.swipeHint")}
        </p>
      ) : null}
      {/*
        `space-y-2` (8px gap) supaya rounded corners `SwipeableRow`
        (rounded-2xl) tidak tabrakan antar row. Spine yang absolute-positioned
        tetap continuous karena render relatif ke parent `<div role="list">`
        yang tidak berubah tinggi-nya.

        Sebelumnya `space-y-0` → row saling nempel, rounded corner adjacent
        row menutup satu sama lain → visual overlap.
      */}
      <div role="list" className="relative space-y-2">
        {/* Continuous spine — sits behind all rows. We use absolute so the
            line doesn't shift when a row is swiped. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-4 top-3 bottom-3 w-0.5 bg-(--color-border)"
        />
        {logs.map((log, idx) => {
          const row = (
            <div className="relative flex items-start gap-4 bg-(--color-bg) py-3 pl-10">
              {/*
                Dot positioning: `top-[1.125rem]` (18px) supaya center-nya
                sejajar dengan baseline "12,500 KM" text baris pertama.
                Sebelumnya pakai `top-4.5` — INVALID di Tailwind v4 (default
                spacing scale hanya 0.5-increment, tidak ada 4.5). Class
                di-ignore silently → dot fallback ke `top: auto` (floating
                di posisi container natural, tidak align dengan row).
              */}
              <div
                aria-hidden
                className={`absolute left-2.5 top-[1.125rem] h-3 w-3 rounded-full border-2 border-(--color-surface) ${
                  idx === 0 ? "bg-(--color-primary)" : "bg-(--color-border)"
                }`}
              />
              <div className="flex-1">
                <p className="font-bold text-(--color-text)">
                  {formatNumber(log.mileage)} KM
                </p>
                <p className="text-xs text-(--color-text-muted)">
                  {formatDate(log.created_at, {
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
