"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchMotorcycleCategories } from "@/lib/supabase";
import type { MotorcycleCategory } from "@/lib/types";
import { DetailSkeleton } from "@/components/LoadingSkeleton";

const WorkshopMap = dynamic(() => import("@/components/WorkshopMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] animate-pulse rounded-3xl bg-(--color-border)/35 ring-1 ring-(--color-border)/40" />
  ),
});

function WorkshopsContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<MotorcycleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState("");
  const [slug, setSlug] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    const b = searchParams.get("brand") ?? "";
    const s = searchParams.get("slug") ?? "";
    if (b) setBrand(b);
    if (s) setSlug(s);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cats = await fetchMotorcycleCategories();
        if (!cancelled) setCategories(cats);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Peramban tidak mendukung lokasi.");
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => {
        setGeoError("Izin lokasi ditolak atau tidak tersedia. Peta memakai titik perkiraan.");
        setLat(null);
        setLng(null);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.slug === slug) ?? null,
    [categories, slug],
  );

  const mapsQuery = useMemo(() => {
    const b = brand.trim() || "motor";
    const typeHint = activeCategory?.name_display ? ` ${activeCategory.name_display}` : "";
    return `bengkel resmi ${b}${typeHint} terdekat`;
  }, [brand, activeCategory]);

  const googleMapsUrl = useMemo(() => {
    const q = encodeURIComponent(mapsQuery);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }, [mapsQuery]);

  const appleMapsUrl = useMemo(() => {
    const q = encodeURIComponent(mapsQuery);
    return `https://maps.apple.com/?q=${q}`;
  }, [mapsQuery]);

  if (authLoading || !user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-sm font-semibold text-(--color-text-secondary) transition-colors hover:text-(--color-text)"
        >
          ← Back
        </button>

        {loading ? (
          <DetailSkeleton />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold tracking-tight">Bengkel resmi</h1>
              <p className="mt-1 text-sm text-(--color-text-secondary)">
                Peta posisi Anda dan pintasan pencarian bengkel resmi berdasarkan merek dan jenis motor.
              </p>
            </div>

            <WorkshopMap userLat={lat} userLng={lng} height={260} />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={locate}
                className="rounded-full bg-(--color-surface) px-4 py-2 text-xs font-bold shadow-sm ring-1 ring-(--color-border)/60 transition-all hover:shadow-md"
              >
                Refresh lokasi
              </button>
              {geoError && (
                <span className="self-center text-xs font-medium text-amber-700 dark:text-amber-400/90">
                  {geoError}
                </span>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                Merek motor
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full rounded-2xl border border-(--color-border) bg-(--color-bg) px-4 py-3.5 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20"
                placeholder="Contoh: Honda, Yamaha, Kawasaki…"
              />
            </div>

            <div className="mt-5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                Jenis motor (dari database)
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSlug("")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                    slug === ""
                      ? "bg-(--color-primary) text-white shadow-md"
                      : "bg-(--color-surface) text-(--color-text-secondary) ring-1 ring-(--color-border)/60"
                  }`}
                >
                  Semua
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSlug(c.slug)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      slug === c.slug
                        ? "bg-(--color-primary) text-white shadow-md"
                        : "bg-(--color-surface) text-(--color-text-secondary) ring-1 ring-(--color-border)/60"
                    }`}
                  >
                    {c.name_display.replace(/^Motor\s/, "")}
                  </button>
                ))}
              </div>
              {activeCategory?.tips && (
                <p className="mt-3 text-xs leading-relaxed text-(--color-text-secondary)">{activeCategory.tips}</p>
              )}
            </div>

            <div className="mt-8 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                Buka di aplikasi peta
              </p>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-3xl bg-(--color-primary) py-4 text-center text-sm font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.99]"
              >
                Google Maps — {mapsQuery}
              </a>
              <a
                href={appleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-3xl border border-(--color-border) bg-(--color-surface) py-3.5 text-center text-sm font-bold shadow-sm transition-all hover:shadow-md"
              >
                Apple Maps
              </a>
            </div>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-(--color-text-muted)">
              Hasil pencarian disediakan oleh layanan peta pihak ketiga. Verifikasi alamat bengkel resmi di situs
              merek jika perlu.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function WorkshopsPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <WorkshopsContent />
    </Suspense>
  );
}
