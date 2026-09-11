"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  LOCALES,
  LOCALE_FLAGS,
  LOCALE_LABELS,
  useTranslation,
  type Locale,
} from "@/lib/i18n";

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-(--color-primary)" : "bg-(--color-border)"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/**
 * Bottom-sheet dialog untuk memilih bahasa.
 *
 * Struktur & interaksi sengaja disamakan dengan `AddMileageModal`:
 *  • Portal ke `document.body` — hindari sheet "kekunci" di dalam
 *    containing block layout (`overflow-x-clip`) yang bisa membuat
 *    z-index kalah dari `BottomNav`.
 *  • Edge-to-edge di mobile (`items-end`, `rounded-t-3xl`) → center dialog
 *    di desktop (`sm:items-center`, `sm:rounded-3xl`, `sm:mx-4`).
 *  • Drag handle kecil di atas sebagai hint bottom-sheet.
 *  • Body scroll lock + Escape-to-close saat sheet terbuka.
 *  • Safe-area inset bawah supaya tombol terakhir tidak nabrak home indicator iOS.
 *
 * Kenapa modal daftar radio, bukan dropdown/native `<select>`?
 *  • Mobile-first — tap target besar & label lebih mudah dibaca.
 *  • Konsisten dengan `AddMileageModal` — user tidak perlu belajar interaksi baru.
 */
/** Threshold pixel — jarak minimum drag ke bawah sebelum sheet close. */
const DRAG_DISMISS_THRESHOLD_PX = 100;
/** Timing untuk snap-back & slide-out. Nilainya = durasi CSS di bawah. */
const DRAG_ANIMATION_MS = 220;
/** Easing "iOS-ish" — decelerate cepat di awal, smooth di akhir. */
const DRAG_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

function LanguagePickerDialog({
  open,
  current,
  onClose,
  onSelect,
  title,
  subtitle,
}: {
  open: boolean;
  current: Locale;
  onClose: () => void;
  onSelect: (locale: Locale) => void;
  title: string;
  /**
   * Optional short helper text di bawah `title`. Kalau kosong / undefined,
   * elemen `<p>` sengaja tidak dirender supaya tidak ada whitespace yang
   * terlihat kosong (lebih rapi daripada `<p></p>`).
   */
  subtitle?: string;
}) {
  const { t } = useTranslation();
  // `mounted` guard supaya `createPortal(document.body)` tidak dipanggil
  // saat SSR (`document` undefined).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Drag-to-dismiss gesture
  //
  // Kenapa manipulasi DOM langsung via ref alih-alih React state?
  //  • Setiap pointermove akan trigger re-render kalau pakai state → laggy.
  //  • Transform di-set inline pakai `style.transform` — GPU-accelerated & cepat.
  //  • Pointer Events API dipakai (bukan touch events) supaya unified antara
  //    trackpad-drag di desktop dan sentuh di mobile.
  // ---------------------------------------------------------------------------
  const sheetRef = useRef<HTMLDivElement>(null);
  /** Y-koordinat saat pointer pertama turun. `null` = tidak sedang dragging. */
  const dragStartY = useRef<number | null>(null);

  /**
   * Terapkan transform ke sheet. `animate=true` untuk snap-back / slide-out,
   * `false` untuk mengikuti jari secara real-time (tanpa transisi supaya
   * gerakan tidak terasa "berat").
   */
  const applyTransform = (y: number, animate: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animate
      ? `transform ${DRAG_ANIMATION_MS}ms ${DRAG_EASING}`
      : "none";
    el.style.transform = y === 0 ? "" : `translateY(${y}px)`;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Jangan aktifkan drag kalau tap-nya di elemen interaktif — biar tombol
    // "Pilih bahasa" tetap merespon tap normal, dan bukan malah nge-drag.
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='button']")) {
      return;
    }
    dragStartY.current = e.clientY;
    // Cancel snap-back transition kalau user langsung drag lagi sebelum
    // animasi selesai (mis. quick swipe up-down).
    applyTransform(0, false);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointerId sudah ter-release oleh browser — abaikan */
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    // Rubber-band ke atas: kasih user feedback bahwa arah UP tidak berguna,
    // tapi jangan lock hard (elastic resistance ala iOS).
    const y = delta < 0 ? -Math.min(40, Math.sqrt(-delta) * 5) : delta;
    applyTransform(y, false);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    dragStartY.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (delta > DRAG_DISMISS_THRESHOLD_PX) {
      // Slide out ke bawah dulu, baru unmount lewat onClose. Kalau langsung
      // onClose, sheet menghilang tanpa animasi (jelek untuk swipe-down).
      applyTransform(window.innerHeight, true);
      window.setTimeout(onClose, DRAG_ANIMATION_MS);
    } else {
      // Snap back ke posisi asal.
      applyTransform(0, true);
    }
  };

  // Body scroll lock + Escape-to-close — sama seperti `AddMileageModal`.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
    >
      {/* Backdrop sebagai <button> supaya click-to-close accessible via keyboard */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-150 hover:bg-black/45"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
        // `touch-none` = `touch-action: none`, mencegah browser handle
        // scroll/pinch native supaya gesture kita yang jalan. Aman di sini
        // karena isi sheet pendek (2 pilihan) — tidak butuh scroll internal.
        // `will-change-transform` beri hint ke browser untuk promote ke layer
        // GPU sebelum drag dimulai (menghindari flicker pas first frame).
        className="relative z-10 flex w-full max-w-md flex-col rounded-t-3xl bg-(--color-bg) shadow-2xl touch-none will-change-transform sm:mx-4 sm:rounded-3xl"
      >
        {/* Drag handle — bottom-sheet affordance (khusus mobile).
            Cursor grab/grabbing memberi feedback bahwa area ini bisa di-drag. */}
        <div
          className="flex cursor-grab justify-center pt-3 active:cursor-grabbing sm:hidden"
          aria-hidden
        >
          <div className="h-1 w-10 rounded-full bg-(--color-border)" />
        </div>

        <div className="space-y-4 px-5 pt-4 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:p-6 sm:pb-7">
          <div>
            <h3 className="text-base font-bold">{title}</h3>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-(--color-text-secondary)">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            {LOCALES.map((code) => {
              const selected = code === current;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    onSelect(code);
                    onClose();
                  }}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                    selected
                      ? "border-(--color-primary) bg-(--color-primary-soft)"
                      : "border-(--color-border) hover:bg-(--color-surface-alt)"
                  }`}
                >
                  <span aria-hidden className="text-xl">
                    {LOCALE_FLAGS[code]}
                  </span>
                  <span className="flex-1 text-sm font-semibold">
                    {LOCALE_LABELS[code]}
                  </span>
                  {selected && (
                    <CheckIcon className="h-4 w-4 text-(--color-primary)" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { t, locale, setLocale, formatDate } = useTranslation();
  const [showLogout, setShowLogout] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === "dark" || (!stored && prefersDark);
    setDarkMode(isDark);
    // Defensive: keep <html>.dark in sync in case the bootstrap script and the
    // current DOM state diverged (e.g. user toggled in another tab).
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const handleThemeToggle = (enabled: boolean) => {
    setDarkMode(enabled);
    document.documentElement.classList.toggle("dark", enabled);
    localStorage.setItem("theme", enabled ? "dark" : "light");
  };

  if (authLoading || !user) return null;

  const handleLogout = () => {
    logout();
    router.replace("/access");
  };

  // `memberSince` dulu di-hardcode ke "en-US". Sekarang ikut locale aktif.
  const memberSince = formatDate(new Date(user.created_at), {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <main className="flex-1 px-5 pt-6">
        {/* Avatar + Name centered */}
        <div className="flex flex-col items-center pt-4 pb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-(--color-primary-soft) text-3xl font-bold text-(--color-primary) ring-4 ring-(--color-primary)/10">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-4 text-xl font-bold">{user.name}</h1>
          <p className="mt-0.5 text-sm text-(--color-text-secondary)">
            {user.email || user.phone}
          </p>
        </div>

        {/* Account section */}
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
          {t("profile.account")}
        </p>
        <div className="rounded-2xl bg-(--color-surface) shadow-sm">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <UserIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-(--color-text-muted)">{t("profile.fullName")}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-(--color-text-muted)/50" />
          </div>

          {user.email && (
            <>
              <div className="mx-4 border-t border-(--color-border)/60" />
              <div className="flex items-center gap-3.5 px-4 py-3.5">
                <MailIcon className="h-5 w-5 text-(--color-text-muted)" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{user.email}</p>
                  <p className="text-xs text-(--color-text-muted)">{t("profile.email")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-(--color-text-muted)/50" />
              </div>
            </>
          )}

          {user.phone && (
            <>
              <div className="mx-4 border-t border-(--color-border)/60" />
              <div className="flex items-center gap-3.5 px-4 py-3.5">
                <PhoneIcon className="h-5 w-5 text-(--color-text-muted)" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{user.phone}</p>
                  <p className="text-xs text-(--color-text-muted)">{t("profile.phone")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-(--color-text-muted)/50" />
              </div>
            </>
          )}

          <div className="mx-4 border-t border-(--color-border)/60" />
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <ShieldIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium capitalize">{user.role}</p>
              <p className="text-xs text-(--color-text-muted)">{t("profile.role")}</p>
            </div>
          </div>

          <div className="mx-4 border-t border-(--color-border)/60" />
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <CalendarIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">{memberSince}</p>
              <p className="text-xs text-(--color-text-muted)">{t("profile.memberSince")}</p>
            </div>
          </div>
        </div>

        {/* Preferences section */}
        <p className="mt-5 mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-muted)">
          {t("profile.preferences")}
        </p>
        <div className="rounded-2xl bg-(--color-surface) shadow-sm">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <MoonIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t("profile.darkMode")}</p>
              <p className="text-xs text-(--color-text-muted)">
                {darkMode ? t("profile.darkModeOn") : t("profile.darkModeOff")}
              </p>
            </div>
            <ToggleSwitch checked={darkMode} onChange={handleThemeToggle} />
          </div>

          {/* Language selector row */}
          <div className="mx-4 border-t border-(--color-border)/60" />
          <button
            type="button"
            onClick={() => setShowLanguage(true)}
            className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-(--color-surface-alt)"
            aria-haspopup="dialog"
            aria-expanded={showLanguage}
          >
            <GlobeIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t("profile.language")}</p>
              <p className="text-xs text-(--color-text-muted)">
                {t("profile.languageSublabel")}
              </p>
            </div>
            <span className="flex items-center gap-2">
              {/* Bendera saja — lebih ringkas & language-neutral secara visual.
                  `leading-none` mencegah emoji bikin baris jadi tinggi.
                  `sr-only` di span teks memastikan screen reader tetap
                  mendengar nama bahasa (emoji tidak diumumkan oleh AT). */}
              <span aria-hidden className="text-lg leading-none">
                {LOCALE_FLAGS[locale]}
              </span>
              <span className="sr-only">{LOCALE_LABELS[locale]}</span>
              <ChevronRight className="h-4 w-4 text-(--color-text-muted)/50" />
            </span>
          </button>
        </div>

        {/* Logout */}
        <div className="mt-5 rounded-2xl bg-(--color-surface) shadow-sm">
          <button
            onClick={() => setShowLogout(true)}
            className="flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-colors hover:bg-(--color-surface-alt)"
          >
            <LogoutIcon className="h-5 w-5 text-(--color-critical)" />
            <span className="text-sm font-semibold text-(--color-critical)">{t("profile.logout")}</span>
          </button>
        </div>
      </main>

      <ConfirmDialog
        open={showLogout}
        title={t("profile.logoutTitle")}
        message={t("profile.logoutMessage")}
        confirmLabel={t("profile.logoutConfirm")}
        cancelLabel={t("profile.logoutCancel")}
        variant="danger"
        onConfirm={handleLogout}
        onCancel={() => setShowLogout(false)}
      />

      <LanguagePickerDialog
        open={showLanguage}
        current={locale}
        onClose={() => setShowLanguage(false)}
        onSelect={setLocale}
        title={t("profile.language")}
        subtitle={t("profile.languageSublabel")}
      />
    </div>
  );
}
