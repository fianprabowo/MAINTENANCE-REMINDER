"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";

/**
 * Root redirect — auth-aware landing. Auth-still-loading state shows shared
 * Spinner primitive (identical visual across the app instead of ad-hoc SVG).
 */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/dashboard" : "/access");
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg)">
      <Spinner className="h-6 w-6 text-(--color-text-muted)" />
    </div>
  );
}
