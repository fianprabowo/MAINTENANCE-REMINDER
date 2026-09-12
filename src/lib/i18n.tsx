"use client";

/**
 * Sistem i18n minimal untuk aplikasi Maintenance Reminder.
 *
 * Kenapa custom & ringan (bukan `next-intl` / `react-i18next`)?
 *  • Aplikasi ini CSR-heavy (hampir semua page `"use client"`), sehingga
 *    routing-based i18n dari `next-intl` tidak memberi nilai tambah.
 *  • Bundle size — kita cuma butuh dictionary lookup + persist localStorage.
 *  • Pola context sama dengan `auth`, `selected-vehicle`, `mileage-modal`.
 *
 * Fitur utama:
 *  • Type-safe: bentuk key di-derive dari `en.ts` sehingga TypeScript
 *    akan flag terjemahan yang hilang.
 *  • Persistence: locale disimpan di `localStorage` dan di-restore lewat
 *    bootstrap script (lihat `layout.tsx`) sebelum hydration → no flash.
 *  • Interpolasi: `t("key", { name: "Andi" })` mengganti `{name}` di string.
 *  • Formatter turunan: `formatNumber` & `formatDate` menghormati locale.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./locales/en";
import id from "./locales/id";
import { AppError } from "./errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Locale = "en" | "id";

export const LOCALES: Locale[] = ["en", "id"];

/** BCP-47 tags per locale — dipakai untuk `<html lang>` dan Intl.* */
export const BCP47: Record<Locale, string> = {
  en: "en-US",
  id: "id-ID",
};

/** Nama display bahasa (dipakai di language selector). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  id: "Bahasa Indonesia",
};

/** Bendera emoji — ringan, tanpa asset image. */
export const LOCALE_FLAGS: Record<Locale, string> = {
  en: "🇬🇧",
  id: "🇮🇩",
};

type Messages = typeof en;

/**
 * Rekursif "dot path" ke leaf string. Contoh:
 *   Messages = { profile: { logout: string } } → "profile.logout"
 *
 * Menggunakan template literal + conditional types agar `t("...")` bisa
 * autocomplete di editor dan gagal compile kalau salah ketik.
 */
type Leaves<T> = T extends string
  ? ""
  : {
      [K in keyof T & (string | number)]: T[K] extends string
        ? `${K}`
        : `${K}.${Leaves<T[K]>}`;
    }[keyof T & (string | number)];

export type TranslationKey = Leaves<Messages>;

// ---------------------------------------------------------------------------
// Runtime lookup helpers
// ---------------------------------------------------------------------------

const MESSAGES: Record<Locale, Messages> = { en, id };

const STORAGE_KEY = "maintenance-reminder:locale";
export const DEFAULT_LOCALE: Locale = "id";

function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as string[]).includes(x);
}

/** Resolve locale dari `<html lang>` (yang di-set bootstrap script). */
function readInitialLocale(): Locale {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("lang");
    // `lang` bisa "id-ID"; kita ambil head-nya untuk cocokkan ke Locale.
    if (attr) {
      const head = attr.split("-")[0]?.toLowerCase();
      if (isLocale(head)) return head;
    }
  }
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (isLocale(raw)) return raw;
    } catch {
      /* ignore private mode */
    }
  }
  return DEFAULT_LOCALE;
}

/** Ambil nilai string dari dictionary via dot path. */
function lookup(dict: Messages, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Ganti `{placeholder}` dengan nilai dari `vars`.
 *
 * Nilai `number` di-format via `Intl.NumberFormat(locale)` sehingga output
 * mengikuti separator locale user (mis. "12.500" di id, "12,500" di en).
 * Sebelumnya numbers cuma di-`String()`-kan (raw "12500"), yang
 * memaksa caller pre-format sendiri dengan hardcoded `.toLocaleString("id-ID")`.
 * Auto-format di sini bikin semua caller otomatis locale-aware.
 *
 * Kalau caller BUTUH raw number (mis. version "1.0.0", ID literal),
 * kirim sebagai string dari luar.
 */
function interpolate(
  template: string,
  vars: Record<string, string | number> | undefined,
  locale: Locale,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === null) return `{${k}}`;
    if (typeof v === "number") {
      return new Intl.NumberFormat(BCP47[locale]).format(v);
    }
    return v;
  });
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatDate: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Baca dari bootstrap script agar SSR markup tidak flip pas hydrate.
  // (Kalau bootstrap belum sempat set — mis. saat SSR — kita fallback ke
  // DEFAULT_LOCALE; nilai final di-sinkronkan lewat useEffect di bawah.)
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    return readInitialLocale();
  });

  // Sinkronkan dengan localStorage & `<html lang>` (defensive: kalau
  // ada tab lain yang menulis, atau bootstrap gagal karena error apa pun).
  useEffect(() => {
    const resolved = readInitialLocale();
    if (resolved !== locale) setLocaleState(resolved);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isLocale(e.newValue)) {
        setLocaleState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", BCP47[next]);
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      // Prioritas: locale aktif → fallback English → return key mentah
      // agar developer langsung sadar ada key yang hilang. `locale`
      // di-pass ke interpolate supaya numeric vars di-format
      // locale-aware (via `Intl.NumberFormat`).
      const primary = lookup(MESSAGES[locale], key);
      if (primary) return interpolate(primary, vars, locale);
      const fallback = lookup(MESSAGES.en, key);
      if (fallback) return interpolate(fallback, vars, locale);
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] Missing translation for "${key}"`);
      }
      return key;
    },
    [locale],
  );

  const formatNumber = useCallback(
    (n: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(BCP47[locale], opts).format(n),
    [locale],
  );

  const formatDate = useCallback(
    (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => {
      const date = d instanceof Date ? d : new Date(d);
      return new Intl.DateTimeFormat(BCP47[locale], opts).format(date);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, formatNumber, formatDate }),
    [locale, setLocale, t, formatNumber, formatDate],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/**
 * Convenience hook — dipakai luas kalau komponen hanya butuh `t`.
 * Menghindari destructure berulang di semua tempat.
 */
export function useTranslation() {
  const { t, locale, setLocale, formatNumber, formatDate } = useI18n();
  return { t, locale, setLocale, formatNumber, formatDate };
}

/**
 * Hook helper untuk terjemahkan `AppError` (dari layer service) ke pesan
 * ramah user. Pattern pemakaian di UI:
 *
 *   const describeError = useAppErrorMessage();
 *   try { ... } catch (err) {
 *     toast.error(describeError(err, t("page.saveFailed")));
 *   }
 *
 * - Kalau `err` adalah `AppError`, kembalikan `t(\`appError.${err.code}\`, params)`
 *   dengan params numeric pre-formatted lewat `formatNumber` (locale-aware).
 * - Kalau bukan, kembalikan `fallback` — sengaja tidak render `err.message`
 *   mentah untuk menghindari leak string debug atau bahasa yang tidak
 *   sesuai locale user.
 */
export function useAppErrorMessage() {
  const { t, formatNumber } = useI18n();
  return useCallback(
    (err: unknown, fallback: string): string => {
      if (err instanceof AppError) {
        const key = `appError.${err.code}` as TranslationKey;
        const params: Record<string, string | number> = { ...err.params };
        for (const k of Object.keys(params)) {
          const v = params[k];
          if (typeof v === "number") params[k] = formatNumber(v);
        }
        return t(key, params);
      }
      return fallback;
    },
    [t, formatNumber],
  );
}

/**
 * Konstanta yang bisa di-import dari luar context (mis. saat generate
 * link atau perlu tahu daftar locale untuk selector UI).
 */
export const I18N_STORAGE_KEY = STORAGE_KEY;
