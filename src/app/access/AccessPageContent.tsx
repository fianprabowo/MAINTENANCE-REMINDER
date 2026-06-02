"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase, assertSupabaseConfigured } from "@/lib/supabase/client";
import { toast } from "sonner";

const MAX_ACCESS_CODE_LENGTH = 10;
const INVALID_ACCESS_CODE_MESSAGE = "Invalid access code. Please check and try again.";
const SIMULATED_VERIFICATION_DELAY_MS = 200;

export default function AccessPageContent() {
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && !user) {
      inputRef.current?.focus();
    }
  }, [authLoading, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Please enter your access code.");
      return;
    }

    if (trimmed.length > MAX_ACCESS_CODE_LENGTH) {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_VERIFICATION_DELAY_MS));
      setLoading(false);
      setError(INVALID_ACCESS_CODE_MESSAGE);
      toast.error(INVALID_ACCESS_CODE_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      assertSupabaseConfigured();
    } catch {
      const msg = "App is not configured. Please contact support.";
      setError(msg);
      toast.error(msg);
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
        const msg = payload.error ?? INVALID_ACCESS_CODE_MESSAGE;
        setError(msg);
        toast.error(msg);
        return;
      }

      if (!payload.access_token || !payload.refresh_token) {
        const msg = "Invalid response from server.";
        setError(msg);
        toast.error(msg);
        return;
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (sessionErr) {
        setError(sessionErr.message);
        toast.error(sessionErr.message);
        return;
      }

      toast.success("Welcome!");
      router.replace("/dashboard");
    } catch {
      const msg = "Something went wrong. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-black">
        <div
          role="status"
          aria-label="Loading"
          className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-400"
        />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-black">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-sky-300 opacity-30 blur-3xl dark:opacity-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-300 opacity-30 blur-3xl dark:opacity-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200 opacity-20 blur-3xl dark:opacity-[0.06]"
      />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
        <div className="card-rise w-full max-w-md">
          <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/80 dark:shadow-black/40 sm:p-10">
            <div className="mb-8 flex flex-col items-center text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-5 h-14 w-14 text-sky-500 dark:text-sky-400"
                aria-hidden="true"
              >
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <path d="M8 14.5 11 8.5h4l3.5 5.5" />
                <path d="M15 8.5h2.5l1 3" />
                <path d="M11 8.5 9.5 5.5h2" />
              </svg>

              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Welcome
              </h1>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="access-code" className="sr-only">
                  Access code
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="access-code"
                    type={showCode ? "text" : "password"}
                    name="access-code"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      if (error) setError(null);
                    }}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "access-error" : undefined}
                    disabled={loading}
                    placeholder="Enter access code"
                    className={`h-14 w-full rounded-2xl border pl-4 pr-12 font-mono text-lg tracking-widest text-slate-900 outline-none transition-all placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:ring-4 disabled:opacity-60 dark:text-white dark:placeholder:text-slate-500 ${
                      error
                        ? "border-red-300 focus:border-red-500 focus:ring-red-100 dark:border-red-800/60 dark:focus:border-red-500 dark:focus:ring-red-950/40"
                        : "border-slate-300 focus:border-blue-500 focus:ring-blue-100 dark:border-slate-700 dark:focus:border-blue-500 dark:focus:ring-blue-950/40"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCode((v) => !v)}
                    aria-label={showCode ? "Hide access code" : "Show access code"}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-3 my-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700/50 dark:hover:text-slate-200"
                  >
                    {showCode ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>

                {error && (
                  <p
                    id="access-error"
                    role="alert"
                    className="mt-2 text-sm font-medium text-red-500 dark:text-red-400"
                  >
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-400 to-blue-500 font-semibold text-white shadow-lg shadow-sky-400/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-sky-400/35 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
              >
                {loading ? (
                  <>
                    <svg
                      className="h-5 w-5 animate-spin text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeOpacity="0.25"
                        strokeWidth="4"
                      />
                      <path
                        d="M4 12a8 8 0 0 1 8-8"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>Checking Access...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Don&apos;t have an access code?{" "}
              <a
                href="mailto:support@example.com"
                className="font-medium text-sky-500 transition-colors hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
              >
                Contact support
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
