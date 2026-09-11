/**
 * Generic domain error yang aman di-throw dari layer non-React (Supabase
 * services, pure utilities). UI catch `AppError` lalu translate lewat
 * `t(err.code, err.params)`.
 *
 * Kenapa file terpisah (bukan di `i18n.tsx`)?
 *  - `i18n.tsx` di-mark `"use client"` supaya React context berjalan; kita
 *    tidak ingin memaksa server-side/RSC untuk consume module client-only
 *    hanya karena ingin melempar error.
 *  - `AppError` adalah data structure, bukan React concern. Memisahkan
 *    file bikin dependency graph jelas: services → errors → (nothing).
 *
 * Kenapa `code: string` (bukan `TranslationKey`)?
 *  - Menghindari coupling ke module i18n dari layer service. Type check
 *    tetap terjadi di caller — UI helper `describeAppError()` (di
 *    `i18n.tsx`) cast ke `TranslationKey` saat resolve.
 *  - Pastikan setiap `code` yang kamu pakai di sini punya entry di
 *    `appError.*` locale namespace (lihat `src/lib/locales/en.ts`).
 */
export class AppError extends Error {
  readonly code: string;
  readonly params: Record<string, string | number>;

  constructor(code: string, params: Record<string, string | number> = {}) {
    // `message` sengaja debug-oriented — untuk logging, bukan render UI.
    super(`AppError:${code}`);
    this.name = "AppError";
    this.code = code;
    this.params = params;
  }
}
