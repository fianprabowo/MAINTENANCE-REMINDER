"use client";

import { useEffect, useId, useMemo, useState } from "react";
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

export default function AddVehiclePage() {
  const { user, loading: authLoading } = useAuth();
  const { setSelectedVehicleId } = useSelectedVehicle();
  const router = useRouter();
  const dataListId = useId();

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showAllYears, setShowAllYears] = useState(false);

  const [categories, setCategories] = useState<MotorcycleCategory[]>([]);
  const [models, setModels] = useState<MotorcycleModel[]>([]);

  // Form state. `tipeMotor` drives motorcycle_category_id internally on submit;
  // we keep the raw enum here so the dropdown stays controlled.
  const [tipeMotor, setTipeMotor] = useState<TipeMotor | "">("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
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

  // Native datalist suggestions for "Nama motor", scoped to the selected brand.
  // Datalist gives free-text input + auto-complete with zero JS overhead.
  const modelNameSuggestions = useMemo(() => {
    if (!selectedBrand || selectedBrand === OTHER_BRAND) return [];
    return modelsForTipe.filter((m) => m.brand === selectedBrand).map((m) => m.model_name);
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
    // Also reset auto-filled tank/eff so we don't carry over stale defaults.
    setTankTouched(false);
    setEffTouched(false);
  }, [tipeMotor]);

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

  // ---- Style tokens (lighter borders + shadow-sm per spec) ------------------
  const inputBase =
    "w-full rounded-xl border bg-(--color-surface) px-4 py-3 text-sm shadow-sm outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/15";
  const inputClass = `${inputBase} border-(--color-border)/60`;
  const errorBorder = (value: string) =>
    submitted && !value.trim()
      ? `${inputBase} border-red-300 dark:border-red-800/60`
      : inputClass;

  const cardClass =
    "rounded-xl bg-(--color-surface) p-4 shadow-sm ring-1 ring-(--color-border)/30";
  const sectionLabel =
    "mb-3 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)";

  const yearOptions = buildYearOptions(showAllYears);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-5 pb-8 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-sm font-semibold text-(--color-text-secondary) transition-colors hover:text-(--color-text)"
        >
          ← Kembali
        </button>

        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-(--color-primary-soft) text-2xl">🏍️</div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Tambah motor</h1>
            <p className="mt-1 text-sm text-(--color-text-secondary)">
              Isi 3 hal: tipe motor, merek+nama, dan tahun. Sisanya opsional.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* ---- Tipe Motor (drives oil interval + tank/eff defaults) -------- */}
          <div className={cardClass}>
            <p className={sectionLabel}>Tipe motor *</p>
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

              <div>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={errorBorder(form.name)}
                  placeholder={
                    selectedBrand && selectedBrand !== OTHER_BRAND
                      ? `Nama motor (mis. ${modelNameSuggestions[0] ?? "Beat"}) *`
                      : "Nama motor *"
                  }
                  list={modelNameSuggestions.length > 0 ? dataListId : undefined}
                  autoComplete="off"
                  required
                />
                {modelNameSuggestions.length > 0 && (
                  <datalist id={dataListId}>
                    {modelNameSuggestions.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                )}
              </div>

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

          {/* ---- Pengaturan lanjutan (collapsed by default) ------------------ */}
          <div className={cardClass}>
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-(--color-text)">Pengaturan lanjutan</p>
                <p className="mt-0.5 text-xs text-(--color-text-secondary)">
                  KM, tangki, efisiensi, catatan — opsional
                </p>
              </div>
              <span
                className={`text-(--color-text-secondary) transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                aria-hidden
              >
                ▾
              </span>
            </button>

            {advancedOpen && (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form.initial_mileage}
                    onChange={(e) => setForm({ ...form, initial_mileage: e.target.value })}
                    className={inputClass}
                    placeholder="Contoh: 12500"
                    min={0}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--color-text-muted)">
                    km
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                      className={inputClass}
                      placeholder="Contoh: 5.5"
                      min={0}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--color-text-muted)">
                      L
                    </span>
                  </div>

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
                      className={inputClass}
                      placeholder="Contoh: 45"
                      min={0}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-(--color-text-muted)">
                      km/L
                    </span>
                  </div>
                </div>

                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={inputClass + " resize-none"}
                  rows={3}
                  placeholder="Catatan (opsional)"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="w-full rounded-xl bg-(--color-primary) py-3.5 text-base font-bold text-white shadow-md shadow-(--color-primary)/25 transition-all duration-150 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            {loading ? "Menyimpan…" : "Simpan motor"}
          </button>
        </form>
      </main>
    </div>
  );
}
