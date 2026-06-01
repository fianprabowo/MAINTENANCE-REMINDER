"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase, assertSupabaseConfigured } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function AccessPageContent() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  const inputClass =
    "w-full rounded-2xl border border-(--color-border) px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("Please enter the access code.");
      return;
    }

    setLoading(true);
    try {
      assertSupabaseConfigured();
    } catch {
      toast.error("App is not configured. Set Supabase URL and anon key.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const payload = (await res.json()) as {
        error?: string;
        access_token?: string;
        refresh_token?: string;
      };

      if (!res.ok) {
        toast.error(payload.error ?? "Access denied");
        return;
      }

      if (!payload.access_token || !payload.refresh_token) {
        toast.error("Invalid response from server");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Welcome!");
      router.replace("/dashboard");
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-primary)" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-4 text-5xl">🚗</div>
          <h1 className="text-2xl font-bold uppercase tracking-wide">Access</h1>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            Enter your access code to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            name="access-code"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
            placeholder="Access code"
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-(--color-primary) px-4 py-4 text-base font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.98] active:brightness-90 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
