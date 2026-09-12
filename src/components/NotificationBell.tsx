"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui";
import { useNotifications } from "@/lib/notifications-runner";
import { useTranslation } from "@/lib/i18n";

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
  const router = useRouter();
  const { unreadCount, ready } = useNotifications();
  const { t } = useTranslation();
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
    <div className={`relative inline-flex ${className}`}>
      <IconButton
        label={
          has
            ? t("notificationBell.ariaBadge", { n: display })
            : t("notificationBell.ariaOpen")
        }
        variant="ghost"
        size="lg"
        onClick={() => router.push("/notifications")}
      >
        <BellIcon className="h-5 w-5" />
      </IconButton>
      {has ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-(--color-critical) px-1 text-[10px] font-bold text-(--color-bg) shadow-sm ring-2 ring-(--color-bg)"
        >
          {label}
        </span>
      ) : null}
    </div>
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
