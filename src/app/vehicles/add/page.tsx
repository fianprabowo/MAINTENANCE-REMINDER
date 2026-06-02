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
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Tipe Motor: drives the oil interval lookup (via `motorcycle_categories.slug`).
// We deliberately do NOT split matic by size here — the user shouldn't have to
// know whether their bike is "kecil/sedang/besar". When they pick a model from
// the preset list, the tank capacity & efficiency come straight from that
// preset (which already encodes the size implicitly).
// ---------------------------------------------------------------------------
type TipeMotor = "matic" | "bebek" | "sport";

const TIPE_MOTOR_CONFIG: Record<TipeMotor, { label: string; categorySlug: string }> = {
  matic: { label: "Matic", categorySlug: "matic" },
  bebek: { label: "Bebek", categorySlug: "bebek" },
  sport: { label: "Sport", categorySlug: "sport" },
};

const TIPE_MOTOR_OPTIONS = (Object.entries(TIPE_MOTOR_CONFIG) as [TipeMotor, { label: string }][]).map(
  ([value, cfg]) => ({ value, label: cfg.label }),
);

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

function buildSpecSummary(mileage: string, tank: string, efficiency: string): string {
  const parts: string[] = [];

  const km = mileage.trim();
  if (km) {
    const n = parseInt(km, 10);
    parts.push(Number.isFinite(n) ? `${n.toLocaleString("id-ID")} km` : `${km} km`);
  }

  const tankVal = tank.trim();
  if (tankVal) parts.push(`${tankVal.replace(".", ",")} L`);

  const effVal = efficiency.trim();
  if (effVal) parts.push(`${effVal.replace(".", ",")} km/L`);

  return parts.length > 0 ? parts.join(" • ") : "Belum diisi";
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
      { value: OTHER_BRAND, label: "Lainnya / merek lain" },
    ];
  }, [modelsForTipe]);

  // Model dropdown: preset names for the chosen brand, plus a custom escape hatch.
  const modelNameOptions = useMemo(() => {
    if (!selectedBrand || selectedBrand === OTHER_BRAND) return [];
    const set = new Set<string>();
    for (const m of modelsForTipe) {
      if (m.brand === selectedBrand) set.add(m.model_name);
    }
    return [
      ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n })),
      { value: OTHER_MODEL, label: "Lainnya / nama lain" },
    ];
  }, [modelsForTipe, selectedBrand]);

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

  const specSummary = useMemo(
    () => buildSpecSummary(form.initial_mileage, form.tank_capacity_l, form.fuel_efficiency_km_l),
    [form.initial_mileage, form.tank_capacity_l, form.fuel_efficiency_km_l],
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
      toast.error("Kategori motor tidak ditemukan. Coba refresh halaman.");
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

      toast.success("Motor disimpan!");
      setSelectedVehicleId(vehicle.id);
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menambah motor");
    } finally {
      setLoading(false);
    }
  };

  // ---- Style tokens ---------------------------------------------------------
  // White (--color-bg) input on a soft card surface reads as "active" instead
  // of the previous gray-on-gray look. Strong focus ring + hover border give
  // tactile feedback; the global `input{background:--color-surface}` rule is
  // overridden by the higher-specificity `bg-(--color-bg)` utility.
  const inputBase =
    "w-full rounded-2xl border bg-(--color-bg) px-4 py-3.5 text-sm font-medium text-(--color-text) outline-none transition-all placeholder:font-normal placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-4 focus:ring-(--color-primary)/15";
  const inputClass = `${inputBase} border-(--color-border)/70 hover:border-(--color-border) hover:bg-(--color-primary-soft)/50 bg-white dark:bg-(--color-surface)`;
  const errorBorder = (value: string) =>
    submitted && !value.trim()
      ? `${inputBase} border-(--color-critical) ring-4 ring-(--color-critical)/10`
      : inputClass;

  const cardClass = "rounded-3xl bg-(--color-surface) p-5 shadow-sm";
  const sectionLabel =
    "mb-3 text-sm font-semibold text-(--color-text)";

  const hasSpecValues =
    !!form.initial_mileage.trim() ||
    !!form.tank_capacity_l.trim() ||
    !!form.fuel_efficiency_km_l.trim() ||
    !!form.notes.trim();

  const showNotesField = notesOpen || !!form.notes.trim();

  const specInputClass =
    "w-full rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3.5 text-sm font-medium text-(--color-text) shadow-sm outline-none transition-all placeholder:font-normal placeholder:text-(--color-text-muted) hover:border-slate-300/80 hover:bg-slate-100/80 focus:border-(--color-primary) focus:bg-white dark:border-(--color-border)/50 dark:bg-(--color-surface-alt) dark:hover:bg-(--color-surface-alt) dark:focus:border-(--color-primary) dark:focus:bg-(--color-surface)";

  const specFieldLabel =
    "flex items-center gap-2 text-xs font-semibold tracking-wide text-(--color-text-secondary)";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Kembali"
          className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-(--color-surface) text-(--color-text-secondary) shadow-sm transition-all hover:text-(--color-text) active:scale-95"
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
        </button>

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
                Tambah Kendaraan
              </h1>
              <p className="mt-0.5 text-sm text-(--color-text-secondary)">
                catat detail kendaraan anda
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* ---- Tipe Motor (drives oil interval + tank/eff defaults) -------- */}
          <div className={cardClass}>
            <p className={sectionLabel}>Tipe *</p>
            <CustomSelect
              options={TIPE_MOTOR_OPTIONS}
              value={tipeMotor}
              onChange={(v) => setTipeMotor(v as TipeMotor)}
              placeholder="Pilih tipe motor"
              required
              maxHeight={260}
              error={submitted && !tipeMotor}
            />
          </div>

          {/* ---- Bagian utama: 3 field --------------------------------------- */}
          <div className={cardClass}>
            <p className={sectionLabel}>Data utama</p>
            <div className="space-y-3">
              <CustomSelect
                options={brandOptions}
                value={selectedBrand}
                onChange={(v) => setSelectedBrand(v)}
                placeholder={tipeMotor ? "Pilih merek" : "Pilih tipe motor dulu"}
                required
                maxHeight={240}
                error={submitted && !selectedBrand}
              />

              {selectedBrand === OTHER_BRAND ? (
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={errorBorder(form.name)}
                  placeholder="Nama motor *"
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
                      selectedBrand ? "Pilih nama motor" : "Pilih merek dulu"
                    }
                    required
                    disabled={!selectedBrand}
                    maxHeight={240}
                    error={submitted && !form.name.trim()}
                  />
                  {modelPickerValue === OTHER_MODEL && (
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={errorBorder(form.name)}
                      placeholder="Ketik nama motor *"
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
                placeholder="Tahun produksi *"
                required
                maxHeight={240}
                error={submitted && !form.year}
              />
              <button
                type="button"
                onClick={() => setShowAllYears((s) => !s)}
                className="-mt-1 text-xs font-semibold text-(--color-primary) transition-colors hover:underline"
              >
                {showAllYears
                  ? "Tampilkan 15 tahun terakhir"
                  : "Lebih lama? Tampilkan 30 tahun"}
              </button>
            </div>
          </div>

          {/* ---- Spesifikasi Kendaraan (collapsible) ----------------------- */}
          <div className="overflow-hidden rounded-[20px] bg-white p-5 shadow-sm ring-1 ring-slate-200/60 dark:bg-(--color-surface) dark:ring-(--color-border)/40">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              aria-expanded={advancedOpen}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-(--color-text)">Spesifikasi Kendaraan</p>
                <p
                  className={`mt-1 text-xs leading-relaxed ${hasSpecValues && specSummary !== "Belum diisi"
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
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-out motion-reduce:transition-none ${advancedOpen
                    ? "rotate-180 bg-(--color-primary-soft) text-(--color-primary)"
                    : "bg-slate-100 text-(--color-text-secondary) dark:bg-(--color-surface-alt)"
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
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-(--color-border)/40">
                  {/* Kilometer — full width */}
                  <div className="space-y-2">
                    <span className={specFieldLabel}>
                      Kilometer awal
                    </span>
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={form.initial_mileage}
                        onChange={(e) => setForm({ ...form, initial_mileage: e.target.value })}
                        className={specInputClass}
                        placeholder="Contoh: 12500"
                        min={0}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-(--color-text-muted)">
                        km
                      </span>
                    </div>
                  </div>

                  {/* Tangki + efisiensi — 2 kolom */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <span className={specFieldLabel}>
                        Kapasitas Tangki
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          value={form.tank_capacity_l}
                          onChange={(e) => {
                            setTankTouched(true);
                            setForm({ ...form, tank_capacity_l: e.target.value });
                          }}
                          className={specInputClass}
                          placeholder="5,5"
                          min={0}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-(--color-text-muted)">
                          L
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className={specFieldLabel}>
                        Efisiensi BBM
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          value={form.fuel_efficiency_km_l}
                          onChange={(e) => {
                            setEffTouched(true);
                            setForm({ ...form, fuel_efficiency_km_l: e.target.value });
                          }}
                          className={specInputClass}
                          placeholder="45"
                          min={0}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-(--color-text-muted)">
                          km/L
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Catatan — progressive */}
                  <div className="space-y-2">
                    {showNotesField ? (
                      <>
                        <span className={specFieldLabel}>
                          Catatan
                        </span>
                        <textarea
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                          onBlur={() => {
                            if (!form.notes.trim()) setNotesOpen(false);
                          }}
                          className={`${specInputClass} resize-none`}
                          rows={3}
                          placeholder="Catatan opsional…"
                          autoFocus={notesOpen && !form.notes.trim()}
                        />
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNotesOpen(true)}
                        className="flex w-full items-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3.5 text-left text-sm font-medium text-(--color-text-secondary) shadow-sm transition-all hover:border-slate-300/80 hover:bg-slate-100/80 focus:border-(--color-primary) focus:outline-none dark:border-(--color-border)/50 dark:bg-(--color-surface-alt) dark:focus:border-(--color-primary)"
                      >
                        Tambah catatan
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-(--color-primary) py-4 text-base font-bold text-white shadow-md shadow-(--color-primary)/25 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            {loading ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                  <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
                <span>Menyimpan…</span>
              </>
            ) : (
              <span>Simpan</span>
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
