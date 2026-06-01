import { createClient } from "@supabase/supabase-js";

/**
 * Valid-looking fallbacks so `createClient` does not throw during `next build`
 * when env vars are unset. At runtime, set real values in `frontend/.env.local`.
 */
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "https://placeholder-not-configured.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.build-placeholder";

if (typeof window !== "undefined") {
  const missing =
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (missing) {
    console.warn(
      "[maintenance-reminder] Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local",
    );
  }
}

export const supabase = createClient(url, anonKey);

export function assertSupabaseConfigured(): void {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!u || !k) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to frontend/.env.local (see .env.example).",
    );
  }
}
