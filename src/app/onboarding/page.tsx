"use client";

/**
 * Onboarding page — Step 2 dari 3-step auth flow.
 *
 * Alur: `/` (splash) → `/onboarding` (this) → `/access` (auth form).
 *
 * Pattern-nya di-adopsi dari mobile app onboarding modern (WalkWin, dsb.):
 *   - Hero card besar di atas: brand logo + subtle decoration
 *   - Value prop headline + subtitle di tengah
 *   - CTA primary di bawah
 *
 * Design language yang RISMA-specific:
 *   - Grayscale-first (bukan brand color dominant) — `--color-surface-alt`
 *     untuk hero card, `--color-text`/`--color-bg` inverted untuk CTA.
 *   - Logo `dark:invert` supaya kelihatan di dark mode.
 *   - Subtle decorative dots + hairline stripes di hero card
 *     (menghindari illustration asset yang belum ada).
 *
 * Skip logic:
 *   - User yang sudah login → redirect ke `/dashboard` (bypass onboarding).
 *   - User yang belum login → tampilkan onboarding (per pilihan user
 *     "always show"; tidak ada localStorage flag skip-once).
 *
 * Exit animation:
 *   - Tap "Mulai" → hero + value prop fade + slight upward slide (stagger
 *     ~75ms), button swap ke spinner. Setelah animation selesai (~350ms)
 *     baru navigate ke /access. `/access` di-prefetch di mount supaya
 *     transisi tidak stutter menunggu code split load.
 *   - Prevents double-tap via `isExiting` flag.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

/**
 * Exit animation total duration (ms). Harus sync dengan durasi CSS
 * transition di section-section di bawah + stagger delay. Semakin lama
 * feel-nya lebih deliberate tapi juga bikin user tunggu — 350ms sweet
 * spot untuk "acknowledgement + phase-out" tanpa terasa lag.
 */
const EXIT_ANIMATION_MS = 350;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [isExiting, setIsExiting] = useState(false);

  // Auth-aware guard: logged-in users skip langsung ke dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  // Prefetch /access — code split-nya di-load duluan supaya saat user tap
  // "Mulai", transisi tidak stutter menunggu chunk load. Cheap, cuma
  // client-side hint; safe kalau user tidak pernah tap (dibuang).
  useEffect(() => {
    router.prefetch("/access");
  }, [router]);

  // Handle "Mulai" tap:
  //   1. Set isExiting → trigger CSS transitions di bawah.
  //   2. Setelah animation selesai, router.push (bukan replace) supaya
  //      back-button dari /access balik ke onboarding secara natural.
  //   3. Guard double-tap via isExiting flag.
  const handleStart = () => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => {
      router.push("/access");
    }, EXIT_ANIMATION_MS);
  };

  // Loading / already-logged-in state — spinner supaya tidak flash
  // onboarding UI sebelum redirect ke dashboard.
  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-bg)">
        <Spinner className="h-6 w-6 text-(--color-text-muted)" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-(--color-bg)">
      {/* Top hero — edge-to-edge banner dengan busy widget preview.
          Layout:
            - Full width (kiri-kanan touch screen edges).
            - Top touches viewport edge.
            - Fixed height 60dvh (dynamic viewport height, adaptif ke
              mobile URL bar show/hide).
            - `rounded-b-[2.5rem]` (40px) — lebih rounded dari default
              3xl untuk feel "softer edge".

          Content strategy: dot grid pattern + 4 widget chips di corners
          (preview dari dashboard app: odometer, oil gauge, mileage trend,
          service check). Bukan sekedar dekorasi acak — mengkomunikasikan
          "ini yang akan kamu track di dalam app".

          Chips: `absolute` positioned di 4 corners, `z-10` di atas
          background pattern (z-0), di bawah logo (z-20). */}
      <section
        className={`relative flex h-[60dvh] flex-col items-center justify-center overflow-hidden rounded-b-[2.5rem] bg-(--color-surface-alt) transition-all duration-300 ease-in will-change-transform ${
          isExiting
            ? "-translate-y-4 opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        <DotGridBackground />

        {/* Widget chips — floating preview of dashboard widgets. */}
        <OdometerChip className="absolute left-4 top-6 z-10" />
        <OilGaugeChip className="absolute right-4 top-6 z-10" />
        <TrendChip className="absolute left-4 bottom-6 z-10" />
        <ServiceChip className="absolute right-4 bottom-6 z-10" />

        {/* Center brand block — z-20 supaya di atas chips. */}
        <div className="relative z-20 flex flex-col items-center">
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
        </div>
      </section>

      {/* Bottom — value prop + CTA.
          Layout: flex-1 (mengambil sisa 40dvh) dengan `justify-end` supaya
          content stick ke bawah viewport (natural bottom-anchored CTA
          pattern). Inner div `max-w-sm mx-auto` untuk tablet safety.

          Text exit: stagger 75ms setelah hero (upward slide + fade).
          Button-nya sengaja TIDAK exit (opacity/transform) — stay visible
          sebagai anchor feedback dengan spinner. */}
      <section className="flex flex-1 flex-col justify-end px-6 pb-10 pt-8">
        <div className="mx-auto w-full max-w-sm">
          <div
            className={`mb-6 text-center transition-all duration-300 ease-in will-change-transform ${
              isExiting
                ? "-translate-y-2 opacity-0"
                : "translate-y-0 opacity-100"
            }`}
            style={{ transitionDelay: isExiting ? "75ms" : "0ms" }}
          >
            <h1 className="text-balance text-2xl font-bold leading-tight text-(--color-text)">
              {t("onboarding.headline")}
            </h1>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={isExiting}
            aria-label={t("onboarding.cta")}
            className="flex h-14 w-full items-center justify-center rounded-full bg-(--color-text) text-sm font-bold uppercase tracking-[0.15em] text-(--color-bg) shadow-lg shadow-(--color-text)/20 transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-90"
          >
            {isExiting ? (
              <Spinner className="h-5 w-5" />
            ) : (
              <span>{t("onboarding.cta")}</span>
            )}
          </button>
        </div>
      </section>
    </main>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Hero background & widget chips
 * ══════════════════════════════════════════════════════════════════
 * Semua komponen di bawah bersifat DEKORATIF (`pointer-events-none`,
 * `aria-hidden`) — pattern preview dari dashboard app, bukan interactive
 * UI. Angka & data sengaja realistic (12,340 km, dsb.) supaya user
 * dapat gambaran "yang akan kamu track", bukan lorem ipsum.
 *
 * Grayscale-only: pakai `--color-text` (dark/light auto-flip) + opacity
 * tiers. Bg chip = `--color-bg` (lebih terang dari card
 * `--color-surface-alt`) supaya "float" di atas card.
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Dot grid pattern — subtle texture di background hero.
 * Pakai CSS radial-gradient tiled 20×20px. Opacity 40% (dark: 25%)
 * supaya tidak kompetisi visual dengan chips & logo.
 */
function DotGridBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-25"
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--color-text) 1px, transparent 1.5px)",
        backgroundSize: "20px 20px",
      }}
    />
  );
}

/**
 * Base chip wrapper — konsisten rounded + bg + shadow untuk semua 4
 * corner widgets. Small shadow supaya "float" di atas card bg.
 */
function ChipShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none rounded-2xl bg-(--color-bg) px-3 py-2 shadow-sm ring-1 ring-(--color-text)/5 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** Chip 1 — Odometer: big number + tiny "KM" label. */
function OdometerChip({ className }: { className?: string }) {
  return (
    <ChipShell className={className}>
      <p className="text-[8px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
        Odometer
      </p>
      <p className="text-base font-bold leading-tight text-(--color-text) tabular-nums">
        12,340
        <span className="ml-1 text-[9px] font-medium text-(--color-text-muted)">
          km
        </span>
      </p>
    </ChipShell>
  );
}

/**
 * Chip 2 — Oil gauge: semicircle arc. Track (background) + progress arc
 * (~65% fill). SVG inline supaya scalable + tidak butuh icon lib.
 */
function OilGaugeChip({ className }: { className?: string }) {
  return (
    <ChipShell className={className}>
      <svg
        width="44"
        height="26"
        viewBox="0 0 44 26"
        fill="none"
        className="block text-(--color-text)"
        aria-hidden="true"
      >
        {/* Track — full semicircle at low opacity. */}
        <path
          d="M 4 22 A 18 18 0 0 1 40 22"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        {/* Progress — partial arc ~65%. Start at bottom-left, sweep
            clockwise ~117° (65% of 180°). */}
        <path
          d="M 4 22 A 18 18 0 0 1 33 6.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <p className="mt-0.5 text-center text-[8px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
        Oli
      </p>
    </ChipShell>
  );
}

/** Chip 3 — Mileage trend: mini spark line (preview MileageChart). */
function TrendChip({ className }: { className?: string }) {
  return (
    <ChipShell className={className}>
      <svg
        width="48"
        height="22"
        viewBox="0 0 48 22"
        fill="none"
        className="block text-(--color-text)"
        aria-hidden="true"
      >
        <path
          d="M 2 18 L 9 14 L 16 15 L 23 9 L 30 11 L 37 5 L 46 6"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Endpoint dot untuk emphasize latest value. */}
        <circle cx="46" cy="6" r="1.75" fill="currentColor" />
      </svg>
      <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
        Trend
      </p>
    </ChipShell>
  );
}

/** Chip 4 — Service check badge: checkmark + status label. */
function ServiceChip({ className }: { className?: string }) {
  return (
    <ChipShell className={className}>
      <div className="flex items-center gap-1.5">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-(--color-text)"
          aria-hidden="true"
        >
          {/* Filled circle bg + check stroke. */}
          <circle cx="7" cy="7" r="7" fill="currentColor" />
          <path
            d="M 4 7 L 6 9 L 10 5"
            stroke="var(--color-bg)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <p className="text-[10px] font-bold text-(--color-text)">Rutin</p>
      </div>
      <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
        Servis
      </p>
    </ChipShell>
  );
}
