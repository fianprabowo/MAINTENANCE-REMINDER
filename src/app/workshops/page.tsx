"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchMotorcycleCategories } from "@/lib/supabase";
import type { MotorcycleCategory } from "@/lib/types";
import { DetailSkeleton } from "@/components/LoadingSkeleton";
import { Button, IconButton, SectionLabel, Spinner, TextInput } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

const WorkshopMap = dynamic(() => import("@/components/WorkshopMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center rounded-3xl bg-(--color-border)/35 ring-1 ring-(--color-border)/40">
      <Spinner className="h-8 w-8" />
    </div>
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
        <IconButton
          label={t("workshops.back")}
          variant="ghost"
          size="lg"
          onClick={() => router.back()}
          className="mb-4 self-start"
        >
          <BackIcon className="h-5 w-5" />
        </IconButton>

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

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={locate}
                leadingIcon={<LocateIcon className="h-4 w-4" />}
              >
                {t("workshops.refreshLocation")}
              </Button>
              {geoError && (
                <span className="self-center text-xs font-bold text-(--color-text)">
                  {geoError}
                </span>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <SectionLabel>{t("workshops.brandLabel")}</SectionLabel>
              <TextInput
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder={t("workshops.brandPlaceholder")}
              />
            </div>

            <div className="mt-5">
              <SectionLabel className="mb-2">{t("workshops.typeLabel")}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={slug === "" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setSlug("")}
                >
                  {t("workshops.typeAll")}
                </Button>
                {categories.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant={slug === c.slug ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setSlug(c.slug)}
                  >
                    {c.name_display.replace(/^Motor\s/, "")}
                  </Button>
                ))}
              </div>
              {activeCategory?.tips && (
                <p className="mt-3 text-xs leading-relaxed text-(--color-text-secondary)">{activeCategory.tips}</p>
              )}
            </div>

            <div className="mt-8 space-y-3">
              <SectionLabel>{t("workshops.openInMap")}</SectionLabel>
              <Button
                type="button"
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => window.open(googleMapsUrl, "_blank", "noopener,noreferrer")}
              >
                {t("workshops.googleMapsCta", { q: mapsQuery })}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                fullWidth
                onClick={() => window.open(appleMapsUrl, "_blank", "noopener,noreferrer")}
              >
                {t("workshops.appleMapsCta")}
              </Button>
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

function BackIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function LocateIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export default function WorkshopsPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <WorkshopsContent />
    </Suspense>
  );
}
