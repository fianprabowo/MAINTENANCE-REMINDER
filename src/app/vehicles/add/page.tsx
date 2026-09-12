"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useSelectedVehicle } from "@/lib/selected-vehicle";
import {
  createVehicle,
  fetchMotorcycleCategories,
  fetchMotorcycleModels,
  insertMileage,
} from "@/lib/supabase";
import type { MotorcycleCategory, MotorcycleModel } from "@/lib/types";
import CustomSelect from "@/components/CustomSelect";
import OdometerScanButton from "@/components/OdometerScanButton";
import { Button, IconButton, SectionLabel, TextInput } from "@/components/ui";
import { toast } from "sonner";
import { useAppErrorMessage, useTranslation } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Tipe Motor: drives the oil interval lookup (via `motorcycle_categories.slug`).
// We deliberately do NOT split matic by size here — the user shouldn't have to
// know whether their bike is "kecil/sedang/besar". When they pick a model from
// the preset list, the tank capacity & efficiency come straight from that
// preset (which already encodes the size implicitly).
// ---------------------------------------------------------------------------
type TipeMotor = "matic" | "bebek" | "sport";

const TIPE_MOTOR_CONFIG: Record<TipeMotor, { categorySlug: string }> = {
  matic: { categorySlug: "matic" },
  bebek: { categorySlug: "bebek" },
  sport: { categorySlug: "sport" },
};

// "Lainnya / merek lain" sentinel — distinguishes "no choice yet" from
// "user explicitly opted out of presets".
const OTHER_BRAND = "__other__";
const OTHER_MODEL = "__other_model__";

const RECENT_YEARS = 15;
const ALL_YEARS = 30;

function buildYearOptions(showAll: boolean): { value: string; label: string }[] {
  const current = new Date().getFullYear();
  const span = showAll ? ALL_YEARS : RECENT_YEARS;
  return Array.from({ length: span }, (_, i) => {
    const y = current - i;
    return { value: String(y), label: String(y) };
  });
}

/**
 * Ringkas nilai spec (mileage/tank/eff) menjadi satu baris "12.500 km •
 * 5,5 L • 45 km/L" (id) atau "12,500 km • 5.5 L • 45 km/L" (en).
 *
 * `formatNumber` di-inject dari `useTranslation()` di caller — supaya
 * angka mengikuti locale aktif user, bukan hardcoded `id-ID`. Sebelumnya
 * pakai `toLocaleString("id-ID")` + `replace(".", ",")` yang membuat
 * user Bahasa Inggris tetap lihat format Indonesia.
 *
 * `emptyLabel` di-inject supaya cocok dengan locale ("Belum diisi" vs
 * "Not filled").
 */
function buildSpecSummary(
  mileage: string,
  tank: string,
  efficiency: string,
  emptyLabel: string,
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string,
): string {
  const parts: string[] = [];

  const km = mileage.trim();
  if (km) {
    const n = parseInt(km, 10);
    parts.push(Number.isFinite(n) ? `${formatNumber(n)} km` : `${km} km`);
  }

  const tankVal = tank.trim();
  if (tankVal) {
    // Input form pakai "." sebagai decimal separator (native `<input
    // type="number">`). Kita parse ke Number lalu format via locale.
    const n = parseFloat(tankVal);
    parts.push(
      Number.isFinite(n)
        ? `${formatNumber(n, { maximumFractionDigits: 2 })} L`
        : `${tankVal} L`,
    );
  }

  const effVal = efficiency.trim();
  if (effVal) {
    const n = parseFloat(effVal);
    parts.push(
      Number.isFinite(n)
        ? `${formatNumber(n, { maximumFractionDigits: 2 })} km/L`
        : `${effVal} km/L`,
    );
  }

  return parts.length > 0 ? parts.join(" • ") : emptyLabel;
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function AddVehiclePage() {
  const { user, loading: authLoading } = useAuth();
  const { setSelectedVehicleId } = useSelectedVehicle();
  const router = useRouter();
  const { t, formatNumber } = useTranslation();
  const describeAppError = useAppErrorMessage();

  // Options di-generate di dalam komponen agar label ikut locale aktif.
  const TIPE_MOTOR_OPTIONS = useMemo(
    () => [
      { value: "matic", label: t("vehiclesAdd.typeMatic") },
      { value: "bebek", label: t("vehiclesAdd.typeBebek") },
      { value: "sport", label: t("vehiclesAdd.typeSport") },
    ],
    [t],
  );

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showAllYears, setShowAllYears] = useState(false);

  const [categories, setCategories] = useState<MotorcycleCategory[]>([]);
  const [models, setModels] = useState<MotorcycleModel[]>([]);

  // Form state. `tipeMotor` drives motorcycle_category_id internally on submit;
  // we keep the raw enum here so the dropdown stays controlled.
  const [tipeMotor, setTipeMotor] = useState<TipeMotor | "">("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [modelPickerValue, setModelPickerValue] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    year: "",
    initial_mileage: "",
    tank_capacity_l: "",
    fuel_efficiency_km_l: "",
    notes: "",
  });

  // Touch flags so auto-fill never overwrites a value the user explicitly
  // edited. Reset whenever the user starts a new "branch" of selections.
  const [tankTouched, setTankTouched] = useState(false);
  const [effTouched, setEffTouched] = useState(false);

  const tipeConfig = tipeMotor ? TIPE_MOTOR_CONFIG[tipeMotor] : null;

  // -------------------------------------------------------------------------
  // Models for the chosen Tipe Motor (single category filter — the preset's
  // own tank/eff values implicitly carry the size info).
  // -------------------------------------------------------------------------
  const modelsForTipe = useMemo(() => {
    if (!tipeConfig) return [];
    const cat = categories.find((c) => c.slug === tipeConfig.categorySlug);
    if (!cat) return [];
    return models.filter((m) => m.category_id === cat.id);
  }, [categories, models, tipeConfig]);

  // Brand dropdown: distinct brands from the filtered model list, plus a
  // "Lainnya" escape hatch for brands not in our seed.
  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of modelsForTipe) set.add(m.brand);
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    return [
      ...arr.map((b) => ({ value: b, label: b })),
      { value: OTHER_BRAND, label: t("vehiclesAdd.otherBrand") },
    ];
  }, [modelsForTipe, t]);

  // Model dropdown: preset names for the chosen brand, plus a custom escape hatch.
  const modelNameOptions = useMemo(() => {
    if (!selectedBrand || selectedBrand === OTHER_BRAND) return [];
    const set = new Set<string>();
    for (const m of modelsForTipe) {
      if (m.brand === selectedBrand) set.add(m.model_name);
    }
    return [
      ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n })),
      { value: OTHER_MODEL, label: t("vehiclesAdd.otherModel") },
    ];
  }, [modelsForTipe, selectedBrand, t]);

  // -------------------------------------------------------------------------
  // Fetch reference data once.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, mods] = await Promise.all([
          fetchMotorcycleCategories(),
          fetchMotorcycleModels(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setModels(mods);
      } catch {
        if (!cancelled) {
          setCategories([]);
          setModels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  // -------------------------------------------------------------------------
  // Cascade resets:
  //   tipeMotor change → reset brand+name (different category = different brands)
  //   brand change → don't auto-clear name (user might want to keep typed name)
  // -------------------------------------------------------------------------
  useEffect(() => {
    setSelectedBrand("");
    setModelPickerValue("");
    setForm((prev) => ({ ...prev, name: "" }));
    // Also reset auto-filled tank/eff so we don't carry over stale defaults.
    setTankTouched(false);
    setEffTouched(false);
  }, [tipeMotor]);

  useEffect(() => {
    setModelPickerValue("");
    setForm((prev) => ({ ...prev, name: "" }));
  }, [selectedBrand]);

  // -------------------------------------------------------------------------
  // Auto-fill tank & efficiency: only when an exact preset match (brand +
  // name) is found. Otherwise leave blank so the user clearly sees they're
  // entering a custom motor and can fill the fields manually in "Pengaturan
  // lanjutan". This respects the spec: "Jika tidak tersedia: biarkan kosong".
  // Manual edits are preserved via the touch flags.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!tipeConfig) return;

    const trimmedName = form.name.trim().toLowerCase();
    const matched =
      selectedBrand && selectedBrand !== OTHER_BRAND && trimmedName
        ? modelsForTipe.find(
          (m) =>
            m.brand === selectedBrand &&
            m.model_name.toLowerCase() === trimmedName,
        ) ?? null
        : null;

    if (!matched) {
      // No preset match. Keep whatever's there (could be user-typed values
      // or stale auto-fill). We only clear when the user has NOT touched
      // either field — that way switching brand/name resets cleanly.
      if (!tankTouched && !effTouched) {
        setForm((prev) =>
          prev.tank_capacity_l || prev.fuel_efficiency_km_l
            ? { ...prev, tank_capacity_l: "", fuel_efficiency_km_l: "" }
            : prev,
        );
      }
      return;
    }

    setForm((prev) => {
      const next = { ...prev };
      if (!tankTouched) next.tank_capacity_l = String(matched.tank_capacity_l);
      if (!effTouched) {
        const mid =
          (matched.fuel_efficiency_km_l_min + matched.fuel_efficiency_km_l_max) / 2;
        next.fuel_efficiency_km_l = String(Math.round(mid * 10) / 10);
      }
      return next;
    });
  }, [tipeConfig, selectedBrand, form.name, modelsForTipe, tankTouched, effTouched]);

  const yearOptions = useMemo(() => buildYearOptions(showAllYears), [showAllYears]);

  const specEmptyLabel = t("vehiclesAdd.specNotFilled");
  const specSummary = useMemo(
    () =>
      buildSpecSummary(
        form.initial_mileage,
        form.tank_capacity_l,
        form.fuel_efficiency_km_l,
        specEmptyLabel,
        formatNumber,
      ),
    [
      form.initial_mileage,
      form.tank_capacity_l,
      form.fuel_efficiency_km_l,
      specEmptyLabel,
      formatNumber,
    ],
  );

  if (authLoading || !user) return null;

  // Form-level validity — drives the disabled state of the submit button so
  // users can't fire an invalid request at all.
  const isFormValid =
    !!tipeMotor &&
    form.name.trim().length > 0 &&
    !!form.year &&
    // Brand: either a real preset brand, OR "Lainnya" (then we'll trust the
    // user's nama motor input as the brand+name compound). For simplicity we
    // require the user to pick a brand explicitly.
    !!selectedBrand;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    if (!isFormValid) return;
    if (!tipeConfig) return;

    const cat = categories.find((c) => c.slug === tipeConfig.categorySlug);
    if (!cat) {
      toast.error(t("vehiclesAdd.categoryNotFound"));
      return;
    }

    // Resolve final brand for storage. "Lainnya" doesn't get stored as the
    // sentinel; instead we ask the user to type a brand-prefixed name (or
    // we fall back to "Lainnya" as a string label so the data stays valid).
    const brandToStore =
      selectedBrand === OTHER_BRAND ? "Lainnya" : selectedBrand;

    const tankParsed = form.tank_capacity_l
      ? parseFloat(form.tank_capacity_l.replace(",", "."))
      : NaN;
    const effParsed = form.fuel_efficiency_km_l
      ? parseFloat(form.fuel_efficiency_km_l.replace(",", "."))
      : NaN;

    setLoading(true);
    try {
      const vehicle = await createVehicle({
        name: form.name.trim(),
        type: "motorcycle",
        brand: brandToStore,
        year: parseInt(form.year, 10),
        // Per spec: bensin field removed, default = full.
        fuel_level: 100,
        tank_capacity_l: Number.isFinite(tankParsed) && tankParsed > 0 ? tankParsed : null,
        fuel_efficiency_km_l: Number.isFinite(effParsed) && effParsed > 0 ? effParsed : null,
        notes: form.notes.trim() || undefined,
        motorcycle_category_id: cat.id,
      });

      if (form.initial_mileage) {
        await insertMileage(vehicle.id, parseInt(form.initial_mileage, 10));
      }

      toast.success(t("vehiclesAdd.savedToast"));
      setSelectedVehicleId(vehicle.id);
      router.push("/dashboard");
    } catch (err) {
      toast.error(describeAppError(err, t("vehiclesAdd.failedToast")));
    } finally {
      setLoading(false);
    }
  };

  const cardClass = "rounded-3xl bg-(--color-surface) p-5 shadow-sm";

  const textareaClass =
    "w-full resize-none rounded-2xl border border-transparent bg-(--color-surface-alt) px-5 py-3.5 text-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-text)/20";

  const hasSpecValues =
    !!form.initial_mileage.trim() ||
    !!form.tank_capacity_l.trim() ||
    !!form.fuel_efficiency_km_l.trim() ||
    !!form.notes.trim();

  const showNotesField = notesOpen || !!form.notes.trim();

  const specFieldLabel =
    "flex items-center gap-2 text-xs font-semibold tracking-wide text-(--color-text-secondary)";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        <IconButton
          label={t("vehiclesAdd.back")}
          variant="ghost"
          size="lg"
          onClick={() => router.back()}
          className="mb-5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </IconButton>

        {/* ---- Hero -------------------------------------------------------- */}
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-(--color-primary)/15 bg-(--color-primary-soft)/40 p-6 shadow-sm">
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-(--color-primary-soft) text-(--color-primary) ring-1 ring-(--color-primary)/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8"
                aria-hidden="true"
              >
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <path d="M8 14.5 11 8.5h4l3.5 5.5" />
                <path d="M15 8.5h2.5l1 3" />
                <path d="M11 8.5 9.5 5.5h2" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-(--color-text)">
                {t("vehiclesAdd.heroTitle")}
              </h1>
              <p className="mt-0.5 text-sm text-(--color-text-secondary)">
                {t("vehiclesAdd.heroSubtitle")}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* ---- Tipe Motor (drives oil interval + tank/eff defaults) -------- */}
          <div className={cardClass}>
            <SectionLabel className="mb-3">{t("vehiclesAdd.typeLabel")}</SectionLabel>
            <CustomSelect
              options={TIPE_MOTOR_OPTIONS}
              value={tipeMotor}
              onChange={(v) => setTipeMotor(v as TipeMotor)}
              placeholder={t("vehiclesAdd.typePlaceholder")}
              required
              maxHeight={260}
              error={submitted && !tipeMotor}
            />
          </div>

          {/* ---- Bagian utama: 3 field --------------------------------------- */}
          <div className={cardClass}>
            <SectionLabel className="mb-3">{t("vehiclesAdd.mainDataTitle")}</SectionLabel>
            <div className="space-y-3">
              <CustomSelect
                options={brandOptions}
                value={selectedBrand}
                onChange={(v) => setSelectedBrand(v)}
                placeholder={tipeMotor ? t("vehiclesAdd.brandPlaceholder") : t("vehiclesAdd.brandNeedsType")}
                required
                maxHeight={240}
                error={submitted && !selectedBrand}
              />

              {selectedBrand === OTHER_BRAND ? (
                <TextInput
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  error={submitted && !form.name.trim()}
                  placeholder={t("vehiclesAdd.namePlaceholderCustom")}
                  autoComplete="off"
                  required
                />
              ) : (
                <>
                  <CustomSelect
                    options={modelNameOptions}
                    value={modelPickerValue}
                    onChange={(v) => {
                      setModelPickerValue(v);
                      if (v === OTHER_MODEL) {
                        setForm((prev) => ({ ...prev, name: "" }));
                      } else {
                        setForm((prev) => ({ ...prev, name: v }));
                      }
                    }}
                    placeholder={
                      selectedBrand
                        ? t("vehiclesAdd.namePickerPlaceholder")
                        : t("vehiclesAdd.namePickerNeedsBrand")
                    }
                    required
                    disabled={!selectedBrand}
                    maxHeight={240}
                    error={submitted && !form.name.trim()}
                  />
                  {modelPickerValue === OTHER_MODEL && (
                    <TextInput
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      error={submitted && !form.name.trim()}
                      placeholder={t("vehiclesAdd.nameTypeCustom")}
                      autoComplete="off"
                      required
                    />
                  )}
                </>
              )}

              <CustomSelect
                options={yearOptions}
                value={form.year}
                onChange={(v) => setForm({ ...form, year: v })}
                placeholder={t("vehiclesAdd.yearPlaceholder")}
                required
                maxHeight={240}
                error={submitted && !form.year}
              />
              <button
                type="button"
                onClick={() => setShowAllYears((s) => !s)}
                className="-mt-1 text-xs font-semibold text-(--color-primary) transition-colors hover:underline"
              >
                {showAllYears ? t("vehiclesAdd.yearShowRecent") : t("vehiclesAdd.yearShowAll")}
              </button>
            </div>
          </div>

          {/* ---- Spesifikasi Kendaraan (collapsible) -----------------------
              Container pakai `--color-surface` untuk kedua theme (dulu white
              di light + surface di dark). Konsisten dengan card lain di app. */}
          <div className="overflow-hidden rounded-[20px] bg-(--color-surface) p-5 shadow-sm ring-1 ring-(--color-border)/40">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              aria-expanded={advancedOpen}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-(--color-text)">{t("vehiclesAdd.specSectionTitle")}</p>
                <p
                  className={`mt-1 text-xs leading-relaxed ${hasSpecValues && specSummary !== specEmptyLabel
                    ? "font-medium text-(--color-text-secondary)"
                    : "text-(--color-text-muted)"
                    }`}
                >
                  {specSummary}
                </p>
                {form.notes.trim() && !advancedOpen && (
                  <p className="mt-1 truncate text-xs text-(--color-text-muted)">
                    📝 {form.notes.trim()}
                  </p>
                )}
              </div>
              {/*
                Chevron icon container — migrasi dari `bg-slate-100` (light-only
                hardcoded) ke `--color-surface-alt` token supaya sama antara
                light & dark. Selected/open state pakai `--color-text` inverted
                supaya konsisten dengan "loud" pattern lain di app.
              */}
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-out motion-reduce:transition-none ${advancedOpen
                  ? "rotate-180 bg-(--color-text) text-(--color-bg)"
                  : "bg-(--color-surface-alt) text-(--color-text-secondary)"
                  }`}
                aria-hidden
              >
                <ChevronIcon className="h-4 w-4" />
              </span>
            </button>

            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${advancedOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
            >
              <div className="overflow-hidden">
                <div className="mt-4 space-y-4 border-t border-(--color-border)/40 pt-4">
                  {/* Kilometer — full width */}
                  <div className="space-y-2">
                    <span className={specFieldLabel}>
                      {t("vehiclesAdd.specInitialKm")}
                    </span>
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <TextInput
                          type="number"
                          inputMode="numeric"
                          value={form.initial_mileage}
                          onChange={(e) => setForm({ ...form, initial_mileage: e.target.value })}
                          placeholder={t("vehiclesAdd.specInitialKmPlaceholder")}
                          min={0}
                          trailingSlot={
                            <span className="text-xs font-semibold text-(--color-text-muted)">
                              km
                            </span>
                          }
                        />
                      </div>
                      <OdometerScanButton
                        variant="icon"
                        disabled={loading}
                        onDetected={(km) => setForm((f) => ({ ...f, initial_mileage: km }))}
                      />
                    </div>
                  </div>

                  {/* Tangki + efisiensi — 2 kolom */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <span className={specFieldLabel}>
                        {t("vehiclesAdd.specTank")}
                      </span>
                      <TextInput
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={form.tank_capacity_l}
                        onChange={(e) => {
                          setTankTouched(true);
                          setForm({ ...form, tank_capacity_l: e.target.value });
                        }}
                        placeholder={t("vehiclesAdd.specTankPlaceholder")}
                        min={0}
                        trailingSlot={
                          <span className="text-xs font-semibold text-(--color-text-muted)">
                            L
                          </span>
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <span className={specFieldLabel}>
                        {t("vehiclesAdd.specEfficiency")}
                      </span>
                      <TextInput
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={form.fuel_efficiency_km_l}
                        onChange={(e) => {
                          setEffTouched(true);
                          setForm({ ...form, fuel_efficiency_km_l: e.target.value });
                        }}
                        placeholder={t("vehiclesAdd.specEfficiencyPlaceholder")}
                        min={0}
                        trailingSlot={
                          <span className="text-xs font-semibold text-(--color-text-muted)">
                            km/L
                          </span>
                        }
                      />
                    </div>
                  </div>

                  {/* Catatan — progressive */}
                  <div className="space-y-2">
                    {showNotesField ? (
                      <>
                        <span className={specFieldLabel}>
                          {t("vehiclesAdd.specNotes")}
                        </span>
                        <textarea
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                          onBlur={() => {
                            if (!form.notes.trim()) setNotesOpen(false);
                          }}
                          className={textareaClass}
                          rows={3}
                          placeholder={t("vehiclesAdd.specNotesPlaceholder")}
                          autoFocus={notesOpen && !form.notes.trim()}
                        />
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNotesOpen(true)}
                        className="flex w-full items-center gap-2 rounded-2xl border border-transparent bg-(--color-surface-alt) px-5 py-3.5 text-left text-sm font-medium text-(--color-text-secondary) transition-colors hover:bg-(--color-surface) focus:border-(--color-text)/20 focus:outline-none"
                      >
                        {t("vehiclesAdd.specAddNotes")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            disabled={loading || !isFormValid}
          >
            {loading ? t("vehiclesAdd.submitting") : t("vehiclesAdd.submit")}
          </Button>
        </form>
      </main>
    </div>
  );
}
