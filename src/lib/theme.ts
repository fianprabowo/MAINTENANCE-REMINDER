/**
 * Theme-related utilities.
 *
 * Kenapa terpisah?
 *  • `ThemeToggle` di navbar dan preferences toggle di `/profile` sama-sama
 *    perlu sync `<meta name="theme-color">` supaya status bar mobile
 *    (iOS Safari, Chrome Android) ikut update saat user ganti tema.
 *  • Kalau dua tempat itu tidak share util, mudah drift: satu tempat lupa
 *    update meta tag → status bar mismatch → user liat white status bar
 *    di dark app (jelek + confusing).
 *
 * Meta tag ini di-inject oleh bootstrap script di `layout.tsx` (biar
 * first paint sudah benar). Function ini hanya update `content`-nya.
 * Selector `:not([media])` penting: kita target entry non-media supaya
 * override menang atas dua entry media-query yang di-render Next.js
 * dari `viewport.themeColor` config.
 */
export function syncThemeColorMeta(isDark: boolean): void {
  if (typeof document === "undefined") return; // SSR guard
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]:not([media])',
  );
  if (meta) meta.content = isDark ? "#111318" : "#ffffff";
}

/**
 * Color mode = grayscale (default) vs full-color (opt-in).
 * Persisted via localStorage["color-mode"] = "color" | "mono".
 * `mono` = grayscale (default), `color` = full semantic warna.
 *
 * Kenapa "mono" bukan `null`? Explicit lebih aman kalau future kita
 * tambah palet ketiga (mis. sepia, high-contrast). Storage key jadi
 * self-describing.
 */
export type ColorMode = "mono" | "color";

export const COLOR_MODE_STORAGE_KEY = "color-mode";

/**
 * Apply/persist color mode. Idempotent — aman dipanggil berkali-kali.
 *
 *   • Toggle class `.color-mode` di `<html>` (Tailwind + globals.css
 *     variant selectors pick it up otomatis).
 *   • Persist ke localStorage — soft-fail kalau private mode / quota.
 *
 * SSR guard di depan: fungsi ini pure client-side (touch `document` &
 * `localStorage`). Kalau dipanggil di server, tidak-op.
 */
export function applyColorMode(mode: ColorMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("color-mode", mode === "color");
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore — private mode / quota */
  }
}

/**
 * Read persisted color mode. Defaults to "mono" (grayscale) kalau belum
 * pernah di-set atau localStorage inaccessible. Return-nya reflect
 * intent, bukan state DOM aktual (bootstrap script yang sync ke DOM).
 */
export function readColorMode(): ColorMode {
  if (typeof window === "undefined") return "mono";
  try {
    const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return stored === "color" ? "color" : "mono";
  } catch {
    return "mono";
  }
}
