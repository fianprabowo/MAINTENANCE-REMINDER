"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchMotorcycleCategories } from "@/lib/supabase";
import type { MotorcycleCategory } from "@/lib/types";
import { DetailSkeleton } from "@/components/LoadingSkeleton";
import { useTranslation } from "@/lib/i18n";

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
  const { t } = useTranslation();
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
      setGeoError(t("workshops.unsupportedGeo"));
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => {
        setGeoError(t("workshops.permissionDenied"));
        setLat(null);
        setLng(null);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }, [t]);

  useEffect(() => {
    locate();
  }, [locate]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.slug === slug) ?? null,
    [categories, slug],
  );

  const mapsQuery = useMemo(() => {
    // Query string di-generate lewat i18n key `workshops.mapsQuery`. Kita
    // tetap fallback ke "motor" agar hasil pencarian tidak kosong ketika
    // input merek dibiarkan default.
    const b = brand.trim() || (brand ? brand : "motor");
    const typeHint = activeCategory?.name_display ? ` ${activeCategory.name_display}` : "";
    return t("workshops.mapsQuery", { brand: b, type: typeHint });
  }, [brand, activeCategory, t]);

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
          ← {t("workshops.back")}
        </button>

        {loading ? (
          <DetailSkeleton />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold tracking-tight">{t("workshops.title")}</h1>
              <p className="mt-1 text-sm text-(--color-text-secondary)">
                {t("workshops.subtitle")}
              </p>
            </div>

            <WorkshopMap userLat={lat} userLng={lng} height={260} />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={locate}
                className="rounded-full bg-(--color-surface) px-4 py-2 text-xs font-bold shadow-sm ring-1 ring-(--color-border)/60 transition-all hover:shadow-md"
              >
                {t("workshops.refreshLocation")}
              </button>
              {geoError && (
                <span className="self-center text-xs font-medium text-amber-700 dark:text-amber-400/90">
                  {geoError}
                </span>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                {t("workshops.brandLabel")}
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full rounded-2xl border border-(--color-border) bg-(--color-bg) px-4 py-3.5 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/20"
                placeholder={t("workshops.brandPlaceholder")}
              />
            </div>

            <div className="mt-5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">
                {t("workshops.typeLabel")}
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
                  {t("workshops.typeAll")}
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
                {t("workshops.openInMap")}
              </p>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-3xl bg-(--color-primary) py-4 text-center text-sm font-bold text-white shadow-lg shadow-(--color-primary)/30 transition-all hover:brightness-110 active:scale-[0.99]"
              >
                {t("workshops.googleMapsCta", { q: mapsQuery })}
              </a>
              <a
                href={appleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-3xl border border-(--color-border) bg-(--color-surface) py-3.5 text-center text-sm font-bold shadow-sm transition-all hover:shadow-md"
              >
                {t("workshops.appleMapsCta")}
              </a>
            </div>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-(--color-text-muted)">
              {t("workshops.disclaimer")}
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
