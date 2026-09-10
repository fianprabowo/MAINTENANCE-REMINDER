"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications-runner";
import {
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/supabase";
import type { AppNotification } from "@/lib/types";
import { CardSkeleton } from "@/components/LoadingSkeleton";
import SwipeableRow from "@/components/SwipeableRow";
import { useTranslation } from "@/lib/i18n";

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

/**
 * Hook `useRelativeTime`.
 *
 * Formatter waktu relatif ("2 mnt lalu", "kemarin", dst) yang ikut
 * locale aktif. Dibuat sebagai hook agar `t` dan `formatDate` tetap
 * memory-stable per render — kalau kita return closure "beku", React
 * tidak bisa mendeteksi perubahan locale.
 */
function useRelativeTime() {
  const { t, formatDate } = useTranslation();
  return useCallback(
    (iso: string): string => {
      const ts = new Date(iso).getTime();
      if (!Number.isFinite(ts)) return "";
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60_000);
      if (mins < 1) return t("notifications.justNow");
      if (mins < 60) return t("notifications.minutesAgo", { n: mins });
      const hours = Math.floor(mins / 60);
      if (hours < 24) return t("notifications.hoursAgo", { n: hours });
      const days = Math.floor(hours / 24);
      if (days === 1) return t("notifications.yesterday");
      if (days < 7) return t("notifications.daysAgo", { n: days });
      const weeks = Math.floor(days / 7);
      if (weeks < 5) return t("notifications.weeksAgo", { n: weeks });
      return formatDate(iso, { day: "numeric", month: "short", year: "numeric" });
    },
    [t, formatDate],
  );
}

function kindIcon(kind: string): string {
  if (kind === "reminder_terlewat") return "⚠️";
  if (kind === "reminder_mendekati") return "🔔";
  return "📬";
}

function kindTone(kind: string): {
  ring: string;
  icon: string;
} {
  if (kind === "reminder_terlewat") {
    return {
      ring: "border-red-200 dark:border-red-900/40",
      icon: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    };
  }
  return {
    ring: "border-amber-200 dark:border-amber-900/40",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  };
}

/* ──────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { refresh: refreshGlobal } = useNotifications();
  const { t } = useTranslation();
  const relativeTime = useRelativeTime();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  /** Single source of truth for the currently slid-open row — matches the
   *  pattern used in overview, service-history, and reminder pages so only
   *  one row can be open at a time. */
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await fetchNotifications({
        limit: 100,
        unreadOnly: filter === "unread",
      });
      setItems(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("notifications.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [user, filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at).length,
    [items],
  );

  const handleTap = useCallback(
    async (n: AppNotification) => {
      if (!n.read_at) {
        // Optimistic mark-as-read so the badge updates instantly.
        setItems((prev) =>
          prev.map((x) =>
            x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
          ),
        );
        try {
          await markNotificationRead(n.id);
          await refreshGlobal();
        } catch (err) {
          // Revert on failure.
          setItems((prev) =>
            prev.map((x) => (x.id === n.id ? { ...x, read_at: null } : x)),
          );
          toast.error(err instanceof Error ? err.message : t("notifications.markReadFailed"));
          return;
        }
      }
      if (n.link_to) router.push(n.link_to);
    },
    [router, refreshGlobal, t],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    const previous = items;
    setItems((prev) =>
      prev.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })),
    );
    try {
      await markAllNotificationsRead();
      await refreshGlobal();
      toast.success(t("notifications.markAllToast"));
    } catch (err) {
      setItems(previous);
      toast.error(err instanceof Error ? err.message : t("notifications.markAllFailed"));
    }
  }, [items, unreadCount, refreshGlobal, t]);

  const handleDelete = useCallback(
    async (n: AppNotification) => {
      // Close the swipe immediately so the row doesn't visually snap back
      // mid-removal. Then optimistic remove + persist.
      setOpenSwipeId(null);
      const previous = items;
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      try {
        await deleteNotification(n.id);
        await refreshGlobal();
      } catch (err) {
        setItems(previous);
        toast.error(err instanceof Error ? err.message : t("notifications.deleteFailed"));
      }
    },
    [items, refreshGlobal, t],
  );

  if (authLoading || !user) return null;

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 flex-col gap-4 px-4 pb-32 pt-6 sm:px-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-(--color-text)">
              {t("notifications.title")}
            </h1>
            <p className="mt-0.5 text-xs text-(--color-text-secondary)">
              {unreadCount > 0
                ? t("notifications.subtitleUnread", { n: unreadCount })
                : t("notifications.subtitleAllRead")}
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="rounded-xl border border-(--color-border)/70 px-3 py-2 text-[11px] font-semibold text-(--color-text-secondary) transition-colors hover:border-(--color-border) hover:bg-(--color-surface-alt)"
            >
              {t("notifications.markAllRead")}
            </button>
          ) : null}
        </header>

        {/* Filter */}
        <div className="inline-flex w-fit rounded-full border border-(--color-border)/60 bg-(--color-surface) p-0.5 text-[11px] font-semibold">
          {(
            [
              { v: "all" as const, label: t("notifications.filterAll") },
              { v: "unread" as const, label: t("notifications.filterUnread") },
            ]
          ).map(({ v, label }) => {
            const active = filter === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={`rounded-full px-3 py-1.5 transition-all duration-150 ${
                  active
                    ? "bg-(--color-primary) text-white shadow-sm"
                    : "text-(--color-text-secondary) hover:text-(--color-text)"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : items.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <>
            <p className="text-[11px] text-(--color-text-muted)">
              {t("notifications.listHint")}
            </p>
            {/* role=list/listitem on divs because SwipeableRow renders a
                `<div>` and HTML doesn't allow `<div>` as direct child of
                `<ul>` / `<li>`. Same trick used in service-history. */}
            <div role="list" className="space-y-2">
              {items.map((n) => (
                <div role="listitem" key={n.id}>
                  <SwipeableRow
                    isOpen={openSwipeId === n.id}
                    onOpenChange={(open) =>
                      setOpenSwipeId(open ? n.id : null)
                    }
                    onAction={() => void handleDelete(n)}
                  >
                    <NotificationCard
                      notification={n}
                      onTap={() => void handleTap(n)}
                      relativeTime={relativeTime}
                    />
                  </SwipeableRow>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────── */

function NotificationCard({
  notification: n,
  onTap,
  relativeTime,
}: {
  notification: AppNotification;
  onTap: () => void;
  relativeTime: (iso: string) => string;
}) {
  const { t } = useTranslation();
  const tone = kindTone(n.kind);
  const isUnread = !n.read_at;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={t("notifications.ariaOpen", { title: n.title })}
      className={`relative flex w-full items-start gap-3 rounded-2xl border ${tone.ring} bg-(--color-surface) p-4 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.99] ${
        isUnread ? "ring-1 ring-(--color-primary)/20" : ""
      }`}
    >
      <div
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${tone.icon}`}
      >
        {kindIcon(n.kind)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-(--color-text)">{n.title}</p>
          {isUnread ? (
            <span
              aria-label={t("notifications.ariaUnread")}
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-(--color-primary)"
            />
          ) : null}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-(--color-text-secondary)">
          {n.body}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
          {relativeTime(n.created_at)}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ filter }: { filter: "all" | "unread" }) {
  const { t } = useTranslation();
  const isUnread = filter === "unread";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-(--color-border)/70 bg-(--color-surface)/50 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-surface-alt) text-2xl">
        🎉
      </div>
      <div>
        <p className="text-sm font-semibold text-(--color-text)">
          {isUnread ? t("notifications.emptyUnreadTitle") : t("notifications.emptyAllTitle")}
        </p>
        <p className="mt-1 text-xs text-(--color-text-secondary)">
          {isUnread ? t("notifications.emptyUnreadHint") : t("notifications.emptyAllHint")}
        </p>
      </div>
      <Link
        href="/overview"
        className="mt-2 rounded-xl border border-(--color-border)/70 px-4 py-2 text-xs font-semibold text-(--color-text-secondary) transition-colors hover:border-(--color-border) hover:bg-(--color-surface-alt)"
      >
        {t("notifications.openVehiclesCta")}
      </Link>
    </div>
  );
}
