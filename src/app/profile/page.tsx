"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  applyColorMode,
  readColorMode,
  syncThemeColorMeta,
  type ColorMode,
} from "@/lib/theme";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Modal, SectionLabel } from "@/components/ui";
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

/**
 * Paint-palette icon untuk toggle "Full color" mode. Dipilih visual palette
 * (bukan droplet / paint bucket) supaya distinct dari MoonIcon di baris
 * darkMode di atas — hindari kolisi metaphor "color/theme".
 */
function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 10 10 0 0 0-10-11z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7.5" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
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
      {/*
       * Knob pakai `bg-(--color-bg)` supaya auto-invert di dark mode:
       * light: track dark (primary), knob putih (bg) → visible.
       * dark: track near-white (primary), knob dark (bg) → visible.
       * Sebelumnya `bg-white` — di dark mode knob & track jadi same-white
       * jadi hilang.
       */}
      <span
        className={`inline-block h-5 w-5 rounded-full bg-(--color-bg) shadow-md transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/**
 * Bottom-sheet dialog untuk memilih bahasa.
 *
 * Sekarang pakai `Modal` primitive dari design system (with
 * `enableDragToDismiss`) — semua boilerplate (portal, backdrop, scroll lock,
 * escape close, drag gesture, focus mgmt) di-handle di sana. Component ini
 * cuma responsibility: render locale picker cards.
 *
 * Kenapa modal daftar radio, bukan dropdown/native `<select>`?
 *  • Mobile-first — tap target besar & label lebih mudah dibaca.
 *  • Konsisten dengan `AddMileageModal` — user tidak perlu belajar interaksi baru.
 */
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      ariaLabel={title}
      enableDragToDismiss
    >
      <div className="space-y-4 px-5 pt-4 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:p-6 sm:pb-7">
        <div>
          <h3 className="text-lg font-bold text-(--color-text)">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-sm text-(--color-text-secondary)">
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
    </Modal>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { t, locale, setLocale, formatDate } = useTranslation();
  const [showLogout, setShowLogout] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("mono");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    // Safari private mode / strict privacy settings bisa throw pada
    // localStorage.getItem — fallback ke prefers-color-scheme.
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      /* ignore — private mode */
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === "dark" || (!stored && prefersDark);
    setDarkMode(isDark);
    // Defensive: keep <html>.dark in sync in case the bootstrap script and the
    // current DOM state diverged (e.g. user toggled in another tab).
    document.documentElement.classList.toggle("dark", isDark);
    syncThemeColorMeta(isDark);
    // Color mode dibaca dari localStorage via helper (SSR-safe + soft-fail).
    // Bootstrap script di layout.tsx sudah apply class ke <html> sebelum
    // hydrate — di sini kita cuma sync React state supaya toggle UI reflect
    // realita.
    setColorMode(readColorMode());
  }, []);

  const handleThemeToggle = (enabled: boolean) => {
    setDarkMode(enabled);
    document.documentElement.classList.toggle("dark", enabled);
    // Persist boleh gagal (private mode / quota) — theme tetap ganti di
    // session ini, tapi tidak persist across reload. Better than crash.
    try {
      localStorage.setItem("theme", enabled ? "dark" : "light");
    } catch {
      /* ignore — private mode / quota */
    }
    syncThemeColorMeta(enabled);
  };

  const handleColorModeToggle = (enabled: boolean) => {
    const next: ColorMode = enabled ? "color" : "mono";
    setColorMode(next);
    // applyColorMode handles both DOM class toggle & localStorage persist —
    // dua concern di satu helper supaya ThemeToggle & preferences row tidak
    // drift kalau future kita tambah entry point ketiga.
    applyColorMode(next);
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
        <SectionLabel className="mb-2 px-1">
          {t("profile.account")}
        </SectionLabel>
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
        <SectionLabel className="mt-5 mb-2 px-1">
          {t("profile.preferences")}
        </SectionLabel>
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

          {/* Full-color mode row.
              Opt-in toggle untuk balik ke warna semantic asli (blue/green/
              amber/red). Default = mono grayscale (design intent).
              Ditempatkan setelah darkMode karena keduanya "mengubah tone"
              — grouping visual yang natural. */}
          <div className="mx-4 border-t border-(--color-border)/60" />
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <PaletteIcon className="h-5 w-5 text-(--color-text-muted)" />
            <div className="flex-1">
              <p className="text-sm font-medium">{t("profile.colorMode")}</p>
              <p className="text-xs text-(--color-text-muted)">
                {colorMode === "color"
                  ? t("profile.colorModeOn")
                  : t("profile.colorModeOff")}
              </p>
            </div>
            <ToggleSwitch
              checked={colorMode === "color"}
              onChange={handleColorModeToggle}
            />
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
