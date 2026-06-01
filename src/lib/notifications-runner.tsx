"use client";

/**
 * Client-side notifications provider.
 *
 * Responsibilities:
 *  1. On mount (after auth resolves), evaluate reminders + emit any
 *     overdue/upcoming notifications.
 *  2. Re-evaluate when other parts of the app dispatch
 *     `mr:vehicle-data-changed` (mileage update, service record save).
 *  3. Throttle the evaluation runner to once per minute so rapid
 *     navigation doesn't spam the DB.
 *  4. Cache the unread count + recent inbox preview so the bell badge and
 *     popover render without each consumer re-fetching.
 *  5. Surface a one-shot toast on first-load if unread notifications
 *     exist (per spec: "toast on app open if there are new notifications").
 *
 * NOT responsibilities:
 *  - Web Push registration / Service Worker. That belongs to a follow-up
 *    Phase 2 PR (see project notes).
 *  - Mark-read on toast dismissal. The user must explicitly tap to read.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/auth";
import {
  evaluateAndEmitForUser,
  fetchNotifications,
  getUnreadNotificationCount,
  isNotificationRunThrottled,
  markNotificationRunDone,
} from "@/lib/supabase";
import type { AppNotification } from "@/lib/types";
import { showUnreadNotificationsToast } from "@/components/UnreadNotificationsToast";

type Ctx = {
  unreadCount: number;
  recent: AppNotification[];
  ready: boolean;
  /** Force a refresh of count + recent list (no engine run). */
  refresh: () => Promise<void>;
  /** Run the engine + then refresh. Honors the 60s throttle. */
  runEngine: (opts?: { force?: boolean }) => Promise<void>;
};

const NotificationsContext = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [ready, setReady] = useState(false);

  // Used to gate the "you have N unread" toast to once per session.
  const onloadToastShownRef = useRef(false);
  // Avoid concurrent runs.
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [count, list] = await Promise.all([
        getUnreadNotificationCount(),
        fetchNotifications({ limit: 10 }),
      ]);
      setUnreadCount(count);
      setRecent(list);
    } catch (err) {
      // Surface in console only — a failed refresh shouldn't break the app.
      console.warn("[notifications] refresh failed", err);
    } finally {
      setReady(true);
    }
  }, [user]);

  const runEngine = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (!user) return;
      if (!opts.force && isNotificationRunThrottled()) return;

      // Coalesce concurrent invocations — the engine is idempotent but
      // parallel runs would waste a round-trip.
      if (inflightRef.current) {
        await inflightRef.current;
        return;
      }
      const p = (async () => {
        try {
          await evaluateAndEmitForUser();
          markNotificationRunDone();
          await refresh();
        } catch (err) {
          console.warn("[notifications] runEngine failed", err);
        }
      })();
      inflightRef.current = p;
      try {
        await p;
      } finally {
        inflightRef.current = null;
      }
    },
    [user, refresh],
  );

  // Bootstrap: run engine once auth is ready, then surface a single
  // first-load toast if there's anything new. We pull the latest unread
  // item alongside the count so the toast can preview real content
  // (title + body) instead of a generic "you have N unread".
  useEffect(() => {
    if (authLoading || !user) return;
    void (async () => {
      await runEngine({ force: true });
      if (onloadToastShownRef.current) return;
      try {
        const [count, latestList] = await Promise.all([
          getUnreadNotificationCount(),
          fetchNotifications({ limit: 1, unreadOnly: true }),
        ]);
        if (count <= 0) return;
        onloadToastShownRef.current = true;
        showUnreadNotificationsToast({
          count,
          latest: latestList[0] ?? null,
        });
      } catch (err) {
        // Toast is non-essential — keep silent on failure.
        console.warn("[notifications] unread toast failed", err);
      }
    })();
  }, [authLoading, user, runEngine]);

  // React to app-wide data changes (mileage update, service record save).
  useEffect(() => {
    if (!user) return;
    const onChange = () => {
      void runEngine();
    };
    window.addEventListener("mr:vehicle-data-changed", onChange);
    // Also re-eval when the tab comes back into focus — mirrors mobile app
    // patterns and catches the "app reopened after a day" case.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runEngine();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("mr:vehicle-data-changed", onChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, runEngine]);

  // Reset cached state when user logs out.
  useEffect(() => {
    if (user) return;
    setUnreadCount(0);
    setRecent([]);
    setReady(false);
    onloadToastShownRef.current = false;
  }, [user]);

  const value = useMemo<Ctx>(
    () => ({ unreadCount, recent, ready, refresh, runEngine }),
    [unreadCount, recent, ready, refresh, runEngine],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

/** Read-only consumer for the bell badge and any other ambient UI. */
export function useNotifications(): Ctx {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    // Fallback safe defaults so the bell can render even if a route forgets
    // to wrap with the provider (shouldn't happen — wired in root layout).
    return {
      unreadCount: 0,
      recent: [],
      ready: false,
      refresh: async () => {},
      runEngine: async () => {},
    };
  }
  return ctx;
}
