import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { SelectedVehicleProvider } from "@/lib/selected-vehicle";
import { MileageModalProvider } from "@/lib/mileage-modal";
import { NotificationsProvider } from "@/lib/notifications-runner";
import { I18nProvider } from "@/lib/i18n";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "RISMA",
  description:
    "Ride Inspection Smart Management App — vehicle maintenance tracking and reminder",
};

/**
 * Viewport config — `themeColor` mengatur warna native browser chrome:
 *  • iOS Safari status bar (Home Screen / Add to Home Screen mode)
 *  • Chrome/Edge address bar di Android
 *  • Windows taskbar untuk PWA
 *
 * Kita pasangkan dua entry dengan media query supaya status bar auto-swap
 * antara `#ffffff` (light, sesuai `--color-bg` di `:root`) dan `#111318`
 * (dark, sesuai `--color-bg` di `.dark`). Fallback ini bekerja bagi
 * mayoritas user yang tema-nya match preferences OS.
 *
 * Note: kalau user manual override tema (mis. system=light tapi
 * pilih dark), status bar sepersekian detik pertama bisa mismatch
 * karena media query membaca OS-level preference. Trade-off yang OK
 * untuk sekarang; solusi presisi butuh script injection ke `<head>`
 * yang menyesuaikan meta tag berdasarkan localStorage.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `lang="id"` = default locale. Bootstrap script di bawah akan
    // menimpanya (jika perlu) sebelum React hydrate, sehingga tidak
    // terjadi flash of wrong language. `suppressHydrationWarning` supaya
    // React tidak protes ketika bootstrap mengubah attribute-nya.
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/*
          No-flash theme bootstrap. Runs before hydration to set the `dark` class
          on <html> based on localStorage("theme"), with prefers-color-scheme as fallback.
          Keep this minimal & dependency-free; any error here must not break SSR markup.

          Juga inject/update `<meta name="theme-color">` supaya status bar
          mobile ikut theme yang dipilih user — bukan cuma OS-level pref.
          Kalau `viewport.themeColor` di atas sudah render media-query
          fallback, script ini yang menambahkan/override entry non-media
          untuk kasus manual override (mis. system=light tapi user pilih dark).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { var s = localStorage.getItem('theme'); var d = s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; var c = document.documentElement.classList; d ? c.add('dark') : c.remove('dark'); var m = document.querySelector('meta[name="theme-color"]:not([media])'); if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); } m.setAttribute('content', d ? '#111318' : '#ffffff'); } catch (_) {} })();`,
          }}
        />
        {/*
          No-flash locale bootstrap. Pola sama dengan theme di atas: baca
          localStorage("maintenance-reminder:locale") dan set `<html lang>`
          sebelum React hydrate. Fallback ke navigator.language kalau user
          belum pernah memilih (mis. pertama kali buka aplikasi). Semua
          error di-swallow supaya SSR tidak pernah crash.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { var s = localStorage.getItem('maintenance-reminder:locale'); var l = s || (navigator.language || 'id').toLowerCase().split('-')[0]; if (l !== 'en' && l !== 'id') l = 'id'; document.documentElement.setAttribute('lang', l === 'en' ? 'en-US' : 'id-ID'); } catch (_) {} })();`,
          }}
        />
        {/*
          No-flash color-mode bootstrap. Toggle class `.color-mode` di
          <html> berdasarkan localStorage("color-mode"). Default = mono
          (grayscale) jika belum pernah opt-in. Idempotent + soft-fail
          kalau private mode. Harus running SEBELUM hydrate supaya user
          yang persist `color` tidak lihat flash grayscale sesaat.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { if (localStorage.getItem('color-mode') === 'color') document.documentElement.classList.add('color-mode'); } catch (_) {} })();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-(--color-bg) text-(--color-text) antialiased">
        <I18nProvider>
          <AuthProvider>
            <SelectedVehicleProvider>
              <NotificationsProvider>
                <MileageModalProvider>
                  <div className="mx-auto w-full max-w-md overflow-x-clip pb-[max(6.5rem,calc(env(safe-area-inset-bottom,0px)+5.25rem))] [&_a]:touch-manipulation [&_a]:transition-transform [&_a]:duration-150 [&_a]:ease-out [&_a:active]:scale-[0.98]">
                    {children}
                  </div>
                  <BottomNav />
                  {/*
                    Full grayscale mode: `richColors` di-hapus supaya sonner
                    tidak render green/red/amber semantic themes untuk
                    success/error/warning. Toast default (surface bg + text)
                    di-override via CSS vars di globals.css (`[data-sonner-toaster]`
                    block) sehingga type-specific styling tetap konsisten
                    dengan design token app — hanya urgency di-encode via
                    font-weight, bukan hue.
                  */}
                  <Toaster
                    position="top-center"
                    swipeDirections={["top", "left", "right"]}
                    toastOptions={{
                      classNames: {
                        toast:
                          "!bg-(--color-surface) !text-(--color-text) !border !border-(--color-border) !shadow-lg !rounded-2xl",
                        title: "!text-(--color-text) !font-semibold",
                        description: "!text-(--color-text-secondary)",
                        actionButton:
                          "!bg-(--color-text) !text-(--color-bg) !font-semibold",
                        cancelButton:
                          "!bg-(--color-surface-alt) !text-(--color-text)",
                        closeButton:
                          "!bg-(--color-surface-alt) !text-(--color-text-muted) !border-(--color-border)",
                      },
                    }}
                  />
                </MileageModalProvider>
              </NotificationsProvider>
            </SelectedVehicleProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
