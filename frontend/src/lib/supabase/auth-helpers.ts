import { supabase } from "./client";

/**
 * Lightweight authenticated-user assertion for data fetches and mutations.
 *
 * Uses `getSession()` which reads from local storage (no network) instead of
 * `getUser()` which hits `/auth/v1/user` on every call. RLS policies on the
 * server remain the actual gate for authorization — this helper only avoids
 * doing un-authenticated queries client-side and supplies `user.id` for owner
 * checks.
 *
 * Returns a minimal shape; callers in the codebase only consume `user.id`.
 */
export async function requireUser(): Promise<{ id: string }> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.user) {
    throw new Error("Not authenticated");
  }
  return { id: session.user.id };
}
