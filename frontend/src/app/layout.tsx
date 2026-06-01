import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { SelectedVehicleProvider } from "@/lib/selected-vehicle";
import { MileageModalProvider } from "@/lib/mileage-modal";
import { NotificationsProvider } from "@/lib/notifications-runner";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maintenance Reminder",
  description: "Vehicle maintenance tracking and reminder application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/*
          No-flash theme bootstrap. Runs before hydration to set the `dark` class
          on <html> based on localStorage("theme"), with prefers-color-scheme as fallback.
          Keep this minimal & dependency-free; any error here must not break SSR markup.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { var s = localStorage.getItem('theme'); var d = s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; var c = document.documentElement.classList; d ? c.add('dark') : c.remove('dark'); } catch (_) {} })();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-(--color-bg) text-(--color-text) antialiased">
        <AuthProvider>
          <SelectedVehicleProvider>
            <NotificationsProvider>
              <MileageModalProvider>
                <div className="mx-auto w-full max-w-md overflow-x-clip pb-[max(6.5rem,calc(env(safe-area-inset-bottom,0px)+5.25rem))] [&_a]:touch-manipulation [&_a]:transition-transform [&_a]:duration-150 [&_a]:ease-out [&_a:active]:scale-[0.98]">
                  {children}
                </div>
                <BottomNav />
                <Toaster
                  position="top-center"
                  richColors
                  swipeDirections={["top", "left", "right"]}
                />
              </MileageModalProvider>
            </NotificationsProvider>
          </SelectedVehicleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
