"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNotifications } from "@/lib/notifications-runner";

/**
 * Header bell icon with an unread-count badge that links to `/notifications`.
 *
 * Wires into the global `NotificationsProvider` so:
 *  - The badge updates whenever the provider triggers a refresh (app open,
 *    KM update event, manual refresh).
 *  - We avoid one extra round-trip per page render by reading the cached
 *    count instead of querying the DB ourselves.
 */
export default function NotificationBell({ className = "" }: { className?: string }) {
  const { unreadCount, ready } = useNotifications();
  // Tiny mount delay so the count doesn't pop in jarringly on first paint.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (ready) setShown(true);
  }, [ready]);

  const display = shown ? unreadCount : 0;
  const has = display > 0;
  const label =
    display > 99 ? "99+" : String(display);

  return (
    <Link
      href="/notifications"
      aria-label={
        has
          ? `Notifikasi (${display} belum dibaca)`
          : "Notifikasi"
      }
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-(--color-border)/70 text-(--color-text-secondary) transition-all hover:border-(--color-border) hover:bg-(--color-surface-alt) active:scale-95 ${className}`}
    >
      <BellIcon className="h-5 w-5" />
      {has ? (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-(--color-critical) px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-(--color-bg)"
        >
          {label}
        </span>
      ) : null}
    </Link>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
