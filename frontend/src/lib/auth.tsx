"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { User } from "./types";
import { supabase, assertSupabaseConfigured } from "./supabase/client";
import { formatAuthError } from "./supabase/auth-errors";

/** When Supabase requires email confirmation, signUp returns a user but no session until they verify. */
export interface RegisterResult {
  needsEmailConfirmation: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string | null, phone: string | null, password: string) => Promise<void>;
  register: (name: string, email: string | null, phone: string | null, password: string) => Promise<RegisterResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function userFromSession(session: Session): Promise<User> {
  const u = session.user;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", u.id)
    .maybeSingle();

  if (profile) {
    return {
      id: profile.id,
      email: u.email ?? undefined,
      phone: profile.phone ?? undefined,
      name: profile.name,
      role: profile.role,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    };
  }

  return {
    id: u.id,
    email: u.email ?? undefined,
    phone: (u.user_metadata?.phone as string | undefined) ?? undefined,
    name: (u.user_metadata?.name as string) || "User",
    role: "user",
    created_at: u.created_at,
    updated_at: u.updated_at ?? u.created_at,
  };
}

/** Shallow equality on identity-relevant fields. Used to preserve referential
 * equality of `user` state across token refreshes so that downstream effects
 * keyed on `user` do NOT cascade re-fetch unnecessarily. */
function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.name === b.name &&
    a.role === b.role &&
    a.updated_at === b.updated_at
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /** Tracks the last session.user.id for which we already loaded the profile.
   * On TOKEN_REFRESHED / unchanged sessions we skip the `profiles` SELECT to
   * avoid a redundant network round-trip every ~1h. */
  const loadedUserIdRef = useRef<string | null>(null);

  const applySession = useCallback(async (session: Session | null, opts?: { force?: boolean }) => {
    if (!session?.user) {
      loadedUserIdRef.current = null;
      setUser((prev) => (prev === null ? prev : null));
      return;
    }
    // Dedup: same user already loaded — skip profile fetch unless forced.
    if (!opts?.force && loadedUserIdRef.current === session.user.id) {
      return;
    }
    try {
      const mapped = await userFromSession(session);
      loadedUserIdRef.current = session.user.id;
      setUser((prev) => (sameUser(prev, mapped) ? prev : mapped));
    } catch {
      loadedUserIdRef.current = null;
      setUser((prev) => (prev === null ? prev : null));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let initialized = false;

    try {
      assertSupabaseConfigured();
    } catch {
      setUser(null);
      setLoading(false);
      return;
    }

    /**
     * Single source of truth for auth state: rely on `onAuthStateChange`,
     * which fires `INITIAL_SESSION` synchronously after subscription. This
     * avoids the previous double-fetch where both `getSession()` and the
     * listener's INITIAL_SESSION event each triggered a `profiles` SELECT.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Force re-fetch only when profile content may genuinely have changed.
      // INITIAL_SESSION / SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED do NOT
      // change profile data — `applySession` will dedup by user.id.
      const force = event === "USER_UPDATED";

      void applySession(session, { force }).finally(() => {
        if (!mounted) return;
        if (!initialized) {
          initialized = true;
          setLoading(false);
        }
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const login = async (email: string | null, phone: string | null, password: string) => {
    assertSupabaseConfigured();
    const identifier = email?.trim() || phone?.trim();
    if (!identifier) {
      throw new Error("Email or phone is required");
    }
    if (!email && phone) {
      throw new Error("Please sign in with your email address (phone login is not available with Supabase email auth).");
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email!.trim(),
      password,
    });
    if (error) throw new Error(formatAuthError(error));
    if (data.session) await applySession(data.session);
  };

  const register = async (name: string, email: string | null, phone: string | null, password: string) => {
    assertSupabaseConfigured();
    const em = email?.trim();
    if (!em) {
      throw new Error("Email is required for registration");
    }
    const { data, error } = await supabase.auth.signUp({
      email: em,
      password,
      options: {
        data: {
          name: name.trim(),
          phone: phone ?? undefined,
        },
      },
    });
    if (error) throw new Error(formatAuthError(error));
    if (data.session) {
      await applySession(data.session);
      return { needsEmailConfirmation: false };
    }
    // Email confirmation enabled in Supabase: user row exists, session only after clicking link in email
    if (data.user && !data.session) {
      return { needsEmailConfirmation: true };
    }
    return { needsEmailConfirmation: false };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
