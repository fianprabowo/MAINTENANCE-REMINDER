"use client";

/**
 * Root splash — Step 1 dari 3-step auth flow.
 *
 * Alur: `/` (this) → `/onboarding` (value prop) → `/access` (auth form).
 *
 * Berperan sebagai:
 *   1. Brand visibility saat auth state di-check (biasanya 100-300ms).
 *   2. Auth-aware landing: redirect ke `/dashboard` atau `/onboarding`
 *      begitu auth ready.
 *
 * Design: logo + wordmark + spinner. Tidak ada CTA — auto-progress via
 * redirect. Konsisten dengan mobile-first splash pattern.
 */

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!loading) {
      // Not-logged-in users go to onboarding (Step 2), not directly to
      // /access — per 3-step pattern. Logged-in users bypass semuanya.
      router.replace(user ? "/dashboard" : "/onboarding");
    }
  }, [user, loading, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-(--color-bg) px-6">
      <Image
        src="/brand/risma-logo.png"
        alt={t("login.brandTitle")}
        width={960}
        height={141}
        className="h-auto w-44 dark:invert"
        priority
      />
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-(--color-text-muted)">
        {t("login.brandTitle")}
      </p>
      <div className="mt-10">
        <Spinner className="h-5 w-5 text-(--color-text-muted)" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    </main>
  );
}
