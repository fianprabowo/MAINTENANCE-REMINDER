"use client";

/**
 * Login page — visual redesign berdasarkan mockup Apple Music-inspired.
 *
 * Auth mechanism: access-code (bukan email/password). Reuse endpoint
 * `/api/access` yang sama dengan halaman `/access` supaya tidak ada
 * duplikasi business logic — perbedaannya cuma di visual language.
 *
 * Route gating: file ini dibalik feature flag `login_page` di
 * `src/app/login/page.tsx`. Set `login_page = true` di tabel
 * `public.system_parameter` supaya route live; kalau false, akan
 * redirect ke `/access` (default fail-safe).
 *
 * Design principles yang dipakai dari mockup:
 *  • Layout minimalis: putih dominan, spacing generous, hierarchy jelas.
 *  • Pill-shape rounded inputs (`rounded-full`) — modern, ramah sentuh.
 *  • Ikon di sisi kiri input sebagai visual cue (bukan sekadar hiasan).
 *  • CTA button gelap kontras (`bg-(--color-text)`) dengan text tipis;
 *    di dark mode otomatis flip (lihat CSS custom properties).
 *  • Tidak ada social login / forgot password — user explicitly memilih
 *    "skip" karena backend-nya belum siap.
 */

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase, assertSupabaseConfigured } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

/**
 * Access code panjangnya konsisten dengan `/access` — 10 karakter.
 * Kalau di atas, kita short-circuit di client tanpa memanggil server
 * (defensive; server tetap re-validate).
 */
const MAX_ACCESS_CODE_LENGTH = 10;
/**
 * Delay artifisial supaya loading state terlihat sekejap saat code jelas
 * invalid (mencegah UX "flash" instan yang membuat error terkesan aneh).
 */
const SIMULATED_VERIFICATION_DELAY_MS = 200;

/* ──────────────────────────────────────────────────────────────────
 * Brand — raster logo (JPEG). File di `public/brand/risma-logo.jpg`.
 * Container `rounded-3xl overflow-hidden` clip corners agar kelihatan
 * seperti brand plate yang disengaja (source image ber-bg hitam).
 * ──────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────
 * Icons — inline SVG supaya tidak butuh icon-library dependency.
 * Semua icon memakai `stroke="currentColor"` sehingga warna ikut
 * parent (`text-*`).
 * ──────────────────────────────────────────────────────────────── */

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 7.15-7.15" />
      <path d="M18 5l3 3" />
      <path d="M16 7l3 3" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
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
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
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
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
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
  );
}

export default function LoginPageContent() {
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();

  /* Auth-aware redirect: user yang sudah login tidak perlu lihat halaman ini. */
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  /* Autofocus di mount — mempercepat interaksi tanpa perlu extra tap. */
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
      setError(t("access.errorEmpty"));
      return;
    }

    const invalidMessage = t("access.errorInvalid");

    /* Client-side length guard — hindari roundtrip untuk kode yang jelas
       terlalu panjang. Server tetap re-validate. */
    if (trimmed.length > MAX_ACCESS_CODE_LENGTH) {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_VERIFICATION_DELAY_MS));
      setLoading(false);
      setError(invalidMessage);
      toast.error(invalidMessage);
      return;
    }

    setLoading(true);
    try {
      assertSupabaseConfigured();
    } catch {
      const msg = t("common.notConfigured");
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
        const msg = payload.error ?? invalidMessage;
        setError(msg);
        toast.error(msg);
        return;
      }

      if (!payload.access_token || !payload.refresh_token) {
        const msg = t("access.errorInvalidResponse");
        setError(msg);
        toast.error(msg);
        return;
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (sessionErr) {
        // `sessionErr.message` dari Supabase auth SDK selalu English +
        // debug-oriented. Tampilkan translated fallback ke user supaya
        // konsisten dengan locale + tidak leak raw API string.
        const msg = t("access.errorSessionFailed");
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success(t("access.signedIn"));
      router.replace("/dashboard");
    } catch {
      const msg = t("common.somethingWrong");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* Loading state saat masih cek session — tampilkan spinner minimalis
     supaya tidak ada flash "login form → langsung redirect". */
  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-bg)">
        <Spinner
          className="h-6 w-6 text-(--color-text-muted)"
        />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col justify-center bg-(--color-bg) px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        {/* Brand block — RISMA logo (transparent PNG dari
            `scripts/process-logo.mjs`). Lihat komentar detail di
            `AccessPageContent.tsx` (file kembar). */}
        <div className="mb-12 flex flex-col items-center text-center">
          <h1 className="sr-only">{t("login.brandTitle")}</h1>
          <Image
            src="/brand/risma-logo.png"
            alt={t("login.brandTitle")}
            width={1024}
            height={682}
            className="mb-4 h-auto w-48 dark:invert"
            priority
          />
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-balance text-(--color-text-muted)">
            {t("login.brandFullName")}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Access-code input — pill shape, icon di kiri, eye toggle di kanan.
              Background lebih terang (`--color-surface-alt`) daripada page
              (`--color-bg`) supaya field "berat" dan menonjol tanpa perlu
              border kuat — mengikuti gaya mockup. */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-(--color-text-muted)">
              <KeyIcon className="h-5 w-5" />
            </div>
            <input
              ref={inputRef}
              id="login-code"
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
              aria-describedby={error ? "login-error" : undefined}
              aria-label={t("access.codeLabel")}
              disabled={loading}
              placeholder={t("login.codePlaceholder")}
              className={`h-14 w-full rounded-full border bg-(--color-surface-alt) pl-14 pr-14 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) disabled:opacity-60 ${
                error
                  ? "border-(--color-text) ring-2 ring-(--color-text)/25 focus:border-(--color-text)"
                  : "border-transparent focus:border-(--color-text)/20"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowCode((v) => !v)}
              aria-label={showCode ? t("login.hideCode") : t("login.showCode")}
              tabIndex={-1}
              className="absolute inset-y-0 right-3 my-auto flex h-9 w-9 items-center justify-center rounded-full text-(--color-text-muted) transition-colors hover:bg-(--color-bg) hover:text-(--color-text)"
            >
              {showCode ? (
                <EyeOffIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Inline error — sengaja di luar input container supaya bisa
              tampil di bawah tanpa memaksa layout input berubah tinggi. */}
          {error ? (
            <p
              id="login-error"
              role="alert"
              className="px-2 text-xs font-bold text-(--color-text)"
            >
              {error}
            </p>
          ) : null}

          {/* CTA — dark rounded pill. Warna otomatis flip di dark mode
              karena pakai `--color-text` (dark → light) sebagai bg. */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-(--color-text) text-sm font-bold uppercase tracking-[0.15em] text-(--color-bg) shadow-lg shadow-(--color-text)/20 transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Spinner className="h-5 w-5" />
                <span>{t("access.submitting")}</span>
              </>
            ) : (
              <span>{t("login.submit")}</span>
            )}
          </button>
        </form>

        {/* Bottom helper — hairline separator + "no code" prompt. */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="h-px w-16 bg-(--color-border)" aria-hidden />
          <p className="text-center text-xs text-(--color-text-muted)">
            {t("login.noCode")}{" "}
            <a
              href="mailto:support@example.com"
              className="font-semibold text-(--color-text) transition-colors hover:underline"
            >
              {t("login.contactSupport")}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
