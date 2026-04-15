import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
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
      </head>
      <body className="min-h-screen bg-(--color-bg) text-(--color-text) antialiased">
        <AuthProvider>
          <div className="mx-auto min-h-screen max-w-md pb-24">
            {children}
          </div>
          <BottomNav />
          <Toaster position="top-center" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
