"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/** History is shown on the vehicle detail page; keep this route for old links. */
export default function HistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && id) {
      router.replace(`/vehicles/${id}#mileage-history`);
    }
  }, [authLoading, user, id, router]);

  return null;
}
