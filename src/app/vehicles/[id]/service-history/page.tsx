"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  deleteServiceRecord,
  fetchKnownServiceLocations,
  fetchServiceRecordsForVehicle,
  fetchVehicleDetail,
  insertMileage,
  insertServiceRecord,
  resetRemindersAfterServiceRecord,
  restoreReminderFromReset,
  updateServiceRecord,
} from "@/lib/supabase";
import { getReminderPreset } from "@/lib/reminder-presets";
import type { ServicePartLine, ServiceRecord, VehicleDetail } from "@/lib/types";
import { DetailSkeleton } from "@/components/LoadingSkeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import SwipeableRow from "@/components/SwipeableRow";
import { partKindsForChips, type PartKind } from "@/lib/part-kinds";
import { toast } from "sonner";

/**
 * Quick-add intent chip. Maps to underlying state (`service_type` +
 * `changed_engine_oil` / `changed_gearbox_oil`) which is computed in
 * `applyChip`. The chip is purely a UI shortcut — never persisted as-is;
 * Supabase only sees the resolved `service_type` + boolean flags. We derive
 * which chip is "active" from form state instead of tracking a separate
 * piece of state, so chip and form can never disagree.
 */
type ServiceChip = "light" | "heavy" | "oil_change";

type PartLine = {
  key: string;
  name: string;
  price: string;
  /** Tag standar dari chip "Tambah cepat". Null untuk free-text manual. */
  kind_slug: string | null;
};

function newPartLine(overrides?: Partial<Omit<PartLine, "key">>): PartLine {
  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { key, name: "", price: "", kind_slug: null, ...overrides };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function digitsOnly(raw: string, maxLen: number) {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

function formatServiceDate(isoDate: string) {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatKm(n: number) {
  return n.toLocaleString("id-ID");
}

function formatIdr(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

/** Format string angka jadi pemisah ribuan id-ID (mis. "1000000" → "1.000.000"). */
function formatThousandsId(digits: string): string {
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("id-ID");
}

function sumParts(parts: ServicePartLine[]) {
  return parts.reduce((s, p) => s + (Number.isFinite(p.price) ? Math.max(0, p.price) : 0), 0);
}

function recordTitle(r: ServiceRecord) {
  return r.service_type === "heavy" ? "Servis besar" : "Servis ringan";
}

/**
 * Ringkas event ganti oli pada satu record menjadi label pendek untuk badge:
 * - "Ganti oli mesin"
 * - "Ganti oli gardan"
 * - "Ganti oli mesin & gardan"  (kedua flag aktif sekaligus)
 * - null  bila bukan event ganti oli
 *
 * Catatan: label "gardan" dipakai universal supaya konsisten — di kategori non-matic
 * istilahnya "gearbox", tapi UI lebih mudah dibaca dengan satu istilah.
 */
function oilChangeLabel(r: ServiceRecord): string | null {
  if (r.changed_engine_oil && r.changed_gearbox_oil) return "Ganti oli mesin & gardan";
  if (r.changed_engine_oil) return "Ganti oli mesin";
  if (r.changed_gearbox_oil) return "Ganti oli gardan";
  return null;
}

function defaultForm() {
  return {
    serviced_at: todayISODate(),
    mileage_at_service: "",
    service_type: "light" as "light" | "heavy",
    description: "",
    location: "",
    changed_engine_oil: false,
    changed_gearbox_oil: false,
  };
}

function recordToPartLines(parts: ServicePartLine[]): PartLine[] {
  if (!parts.length) return [];
  return parts.map((p) => ({
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    name: p.name,
    price: p.price > 0 ? String(p.price) : "",
    kind_slug: p.kind_slug ?? null,
  }));
}

/**
 * Helper untuk schedule focus + scrollIntoView pada input HTML
 * (by id) di tick berikutnya — pakai setTimeout 80ms untuk pastikan
 * elemen sudah mounted setelah React commit. Defensive: kalau elemen
 * tidak ditemukan (mis. user buru-buru tutup modal), no-op.
 */
function focusAndScrollById(id: string, delayMs = 80): void {
  window.setTimeout(() => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.focus();
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, delayMs);
}

function normalizePartLines(lines: PartLine[]): ServicePartLine[] {
  return lines
    .map((l) => ({
      name: l.name.trim(),
      price: Math.max(0, parseInt(digitsOnly(l.price, 12), 10) || 0),
      kind_slug: l.kind_slug ?? null,
    }))
    .filter((l) => l.name.length > 0);
}

/**
 * Slug khusus untuk part-line yang menampung HARGA oli. Dipakai sebagai
 * tag (bukan masuk ke `PART_KINDS` catalog) supaya:
 *   - Halaman Kondisi Part TIDAK mendoubleboards-kan oli (oli tetap
 *     di-track via `changed_engine_oil` / `changed_gearbox_oil` +
 *     `motorcycle_categories` interval — lihat oil-utils.ts).
 *   - Modal servis bisa serialize/deserialize harga oli ke/dari JSONB
 *     `parts` tanpa menambah kolom baru di tabel `service_records`.
 *
 * Tidak menambah slug ini ke PART_KINDS sengaja — kita tidak ingin
 * `partKindsForChips` / `partKindsForCondition` mengembalikan oli.
 */
const OIL_PART_SLUGS = {
  engine: "engine_oil",
  gearbox: "gearbox_oil",
} as const;

/**
 * Split oil-tagged part lines dari free-form parts. Dipakai saat memuat
 * record untuk diedit — harga oli dipindah ke state khusus, sisanya jadi
 * `partLines` biasa.
 */
function splitOilFromParts(parts: ServicePartLine[]): {
  enginePrice: string;
  gearboxPrice: string;
  remaining: ServicePartLine[];
} {
  let enginePrice = "";
  let gearboxPrice = "";
  const remaining: ServicePartLine[] = [];
  for (const p of parts) {
    if (p.kind_slug === OIL_PART_SLUGS.engine) {
      enginePrice = p.price > 0 ? String(p.price) : "";
    } else if (p.kind_slug === OIL_PART_SLUGS.gearbox) {
      gearboxPrice = p.price > 0 ? String(p.price) : "";
    } else {
      remaining.push(p);
    }
  }
  return { enginePrice, gearboxPrice, remaining };
}

/** Interaksi ringan — dipakai di tombol halaman ini */
const btnPress = "transition-all duration-150 active:scale-95";
const btnDisabled = "disabled:pointer-events-none disabled:opacity-50";

/**
 * Set chip Quick-Add. Disusun module-level supaya stabil identitasnya
 * (tidak re-create per render) dan mudah ditambah/diubah satu tempat.
 */
const QUICK_CHIPS: ReadonlyArray<{ id: ServiceChip; label: string }> = [
  { id: "light", label: "Servis ringan" },
  { id: "heavy", label: "Servis besar" },
  { id: "oil_change", label: "Ganti oli" },
];

/** Field input filled-style — single source kelas supaya konsisten lintas form. */
const inputClass =
  "w-full rounded-xl bg-(--color-surface) px-4 py-3 text-sm text-(--color-text) outline-none placeholder:text-(--color-text-muted)/80 ring-1 ring-(--color-border)/40 focus:ring-2 focus:ring-(--color-primary)/40 transition-all duration-150";

/**
 * CTA "Tambah servis" — pakai pola dashed-border tile yang sama dengan
 * "Tambah kendaraan" di Overview (lihat `app/overview/page.tsx`). Tujuannya
 * konsistensi visual antar primary "add" affordance di seluruh aplikasi:
 * lighter weight dari tombol gradient solid, tapi tetap discoverable.
 *
 * Selalu full-width (mobile-first) — pada desktop layout di header berfungsi
 * sebagai hero tile. `aria-label` di-pass agar tetap aksesibel walau visualnya
 * berisi sub-label dekoratif.
 */
function AddServiceButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group flex w-full items-center gap-3.5 rounded-2xl border-2 border-dashed border-(--color-primary)/35 bg-(--color-primary-soft)/30 p-4 text-left transition-all hover:border-(--color-primary)/60 hover:bg-(--color-primary-soft)/60 active:scale-[0.99]`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-primary-soft) text-(--color-primary) transition-transform group-hover:scale-110"
        aria-hidden
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="h-6 w-6"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-(--color-primary)">{label}</span>
        <span className="mt-0.5 block text-xs text-(--color-text-secondary)">
          Catat servis baru kendaraanmu
        </span>
      </span>
      <span
        className="shrink-0 text-(--color-primary)/60 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      >
        →
      </span>
    </button>
  );
}

/** Ikon pensil outline tipis (aksi sekunder) */
function PencilEditIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export default function ServiceHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const modalKmRef = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<VehicleDetail | null>(null);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Quick-Add UI defaults to a minimal form. `advancedOpen` reveals tanggal,
  // lokasi, catatan, oil checklist; `partsOpen` is a separate nested collapse
  // for parts/biaya since most records don't track item-level cost.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  /**
   * Free-form part lines. Kosong di awal (no placeholder row) supaya
   * empty-state bisa render — user diarahkan untuk klik chip dulu.
   * Manual entry tetap bisa lewat "+ Tambah part lain".
   */
  const [partLines, setPartLines] = useState<PartLine[]>(() => []);
  /**
   * Key dari row yang sedang di-animate keluar (fade + slide). Setelah
   * animasi selesai (~180ms), row di-splice dari `partLines`.
   * Null = tidak ada row yang sedang di-remove.
   */
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  /**
   * Chip terakhir yang DI-KLIK user. Ini source-of-truth untuk highlight
   * chip — bukan derivasi dari form state.
   *
   * Kenapa di-track eksplisit: "Servis ringan + tick oli" ≠ "Ganti oli".
   * Kalau cuma derive dari flag oli, chip akan auto-flip ke "Ganti oli"
   * setiap kali user manual centang oli — itu menyalahi intent. Chip
   * "Ganti oli" hanya valid sebagai INTENT eksplisit ("saya cuma ganti
   * oli"). Dengan memisahkan klik-history dari form state, user bebas
   * mix flag tanpa kehilangan label chip mereka.
   */
  const [chipPick, setChipPick] = useState<ServiceChip>("light");
  /**
   * Harga oli mesin & gardan, disimpan sebagai string digit (non-formatted)
   * supaya kontrol input numerik konsisten. Hanya relevan ketika flag
   * `changed_*_oil` aktif. Pada submit, di-serialize jadi part lines
   * bertanda OIL_PART_SLUGS — lihat `buildPayload`.
   */
  const [oilPrices, setOilPrices] = useState<{ engine: string; gearbox: string }>({
    engine: "",
    gearbox: "",
  });
  const oilEnginePriceRef = useRef<HTMLInputElement>(null);
  const oilGearboxPriceRef = useRef<HTMLInputElement>(null);
  const [selectedRecord, setSelectedRecord] = useState<ServiceRecord | null>(null);
  /**
   * Record yang sedang di-konfirmasi untuk dihapus. `null` = tidak ada
   * dialog terbuka. Dipisah dari `selectedRecord` supaya transisi visual
   * (close detail sheet → open confirm dialog) bisa berjalan tanpa flash.
   */
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<ServiceRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState(false);
  /**
   * Swipe-to-delete: id dari record card yang sedang ter-slide terbuka. Hanya
   * satu yang boleh terbuka pada satu waktu — pola yang sama dengan halaman
   * Overview (lihat `src/app/overview/page.tsx`).
   */
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  /** Map id → deskripsi di-expand (object agar React selalu re-render). */
  const [expandedDescById, setExpandedDescById] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState(() => defaultForm());
  /** Saran lokasi untuk autocomplete, didedup lintas kendaraan milik user. */
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);

  const toggleDescriptionExpanded = useCallback((recordId: string) => {
    setExpandedDescById((prev) => ({
      ...prev,
      [recordId]: !prev[recordId],
    }));
  }, []);

  /**
   * Active chip = chip yang di-highlight di UI.
   *
   * Aturan:
   *   1. Source utama = `chipPick` (chip yang user klik terakhir).
   *      Berarti "Servis ringan + tick oli mesin" tetap highlight
   *      "Servis ringan", BUKAN auto-flip ke "Ganti oli". Centang
   *      checkbox oli adalah add-on, bukan intent baru.
   *   2. Fallback safety: kalau chipPick = "oil_change" tapi semua flag
   *      oli sudah di-uncheck (user batalkan), drop ke "light" — karena
   *      "Ganti oli" tanpa flag oli tidak punya makna.
   *   3. service_type tidak memengaruhi derivasi karena `applyChip`
   *      sudah sinkronkan keduanya saat klik. Edit-mode `openEditModal`
   *      yang bertanggung jawab nge-set `chipPick` dari record.
   */
  const activeChip: ServiceChip =
    chipPick === "oil_change" && !form.changed_engine_oil && !form.changed_gearbox_oil
      ? "light"
      : chipPick;

  /**
   * Whether the vehicle's category tracks a separate gearbox/gardan oil
   * interval. Drives the "Ganti oli" preset: matic gets both flags set,
   * non-matic gets only engine oil. Falls back to engine-only for safety.
   */
  const hasGearboxInterval = detail?.motorcycle_category?.has_gearbox_oil_interval ?? false;
  const currentKm = detail?.vehicle.current_mileage_km ?? 0;

  /**
   * Chip click = preset state. Bukan toggle, bukan additive.
   *
   *   - "Servis ringan" / "Servis besar":
   *       set service_type, kosongkan flag oli + harga oli.
   *       Setelah ini user boleh tick checkbox oli secara manual untuk
   *       kombinasi "ringan/besar + ganti oli" — flag-nya mandiri.
   *   - "Ganti oli":
   *       set service_type=light, tick semua flag oli yang relevan.
   *       Harga oli TIDAK di-reset — user yang sedang isi tidak hilang
   *       progres-nya kalau chip yang sama di-klik ulang.
   */
  const applyChip = useCallback(
    (chip: ServiceChip) => {
      setChipPick(chip);
      setForm((f) => {
        if (chip === "oil_change") {
          return {
            ...f,
            service_type: "light",
            changed_engine_oil: true,
            changed_gearbox_oil: hasGearboxInterval,
            mileage_at_service:
              currentKm > 0 && !f.mileage_at_service.trim()
                ? String(currentKm)
                : f.mileage_at_service,
          };
        }
        return {
          ...f,
          service_type: chip,
          changed_engine_oil: false,
          changed_gearbox_oil: false,
        };
      });
      if (chip !== "oil_change") {
        setOilPrices({ engine: "", gearbox: "" });
      }
    },
    [hasGearboxInterval, currentKm],
  );

  /**
   * Toggle satu flag oli + clear harga ketika di-uncheck.
   * Saat dicentang, focus price input untuk akselerasi entry.
   */
  const toggleOilFlag = useCallback(
    (which: "engine" | "gearbox", checked: boolean) => {
      const flagKey = which === "engine" ? "changed_engine_oil" : "changed_gearbox_oil";
      setForm((f) => ({ ...f, [flagKey]: checked }));
      if (!checked) {
        setOilPrices((p) => ({ ...p, [which]: "" }));
      } else {
        // Tunggu re-render dulu supaya input sudah mounted, baru focus.
        window.setTimeout(() => {
          const ref = which === "engine" ? oilEnginePriceRef : oilGearboxPriceRef;
          ref.current?.focus();
        }, 50);
      }
    },
    [],
  );

  const closeAddModal = useCallback(() => {
    setAddModalOpen(false);
    setEditingId(null);
    setForm(defaultForm());
    setAdvancedOpen(false);
    setPartsOpen(false);
    setPartLines([]);
    setRemovingKey(null);
    setOilPrices({ engine: "", gearbox: "" });
    setChipPick("light");
  }, []);

  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm(defaultForm());
    setAdvancedOpen(false);
    setPartsOpen(false);
    setPartLines([]);
    setRemovingKey(null);
    setOilPrices({ engine: "", gearbox: "" });
    setChipPick("light");
    setAddModalOpen(true);
  }, []);

  /**
   * Tambah part dari chip quick-add. Sumber data: catalog `PART_KINDS` di
   * `lib/part-kinds.ts`. Strategi:
   * 1. Skip kalau slug yang sama sudah ada di salah satu baris — mencegah
   *    duplikat ketika user tap chip dua kali tidak sengaja. Match by
   *    `kind_slug`, bukan by nama, supaya user yang sudah edit nama (mis.
   *    "Busi" → "Busi NGK Iridium") tetap dianggap "sudah ada".
   * 2. Kalau ada baris kosong (name + price keduanya empty), isi di sana —
   *    menghindari baris kosong menggantung.
   * 3. Else, append baris baru dengan nama & slug ter-set.
   */
  const addCommonPart = useCallback((kind: PartKind) => {
    // Captured-by-closure: setState callback boleh assign ke variabel
    // outer (React tetap menjalankan callback secara sinkron meski commit
    // di-batch). Pakai `let` supaya kita bisa baca nilai key untuk focus
    // di setTimeout setelah render.
    let targetKey: string | null = null;
    setPartLines((rows) => {
      const slugExists = rows.some((r) => r.kind_slug === kind.slug);
      if (slugExists) return rows;
      const emptyIdx = rows.findIndex(
        (r) => r.name.trim() === "" && r.price.trim() === "" && r.kind_slug == null,
      );
      if (emptyIdx !== -1) {
        targetKey = rows[emptyIdx].key;
        return rows.map((r, i) =>
          i === emptyIdx ? { ...r, name: kind.chip_label, kind_slug: kind.slug } : r,
        );
      }
      const fresh = newPartLine({ name: kind.chip_label, kind_slug: kind.slug });
      targetKey = fresh.key;
      return [...rows, fresh];
    });
    if (targetKey) focusAndScrollById(`part-price-${targetKey}`);
  }, []);

  /**
   * Tambah baris kosong manual (tombol "+ Tambah part lain").
   * Auto-focus name input — chip pakai jalur lain (focus price).
   */
  const addBlankPart = useCallback(() => {
    const fresh = newPartLine();
    setPartLines((rows) => [...rows, fresh]);
    focusAndScrollById(`part-name-${fresh.key}`);
  }, []);

  /**
   * Animasi remove: tandai `removingKey` → row akan di-render dengan
   * class fade+collapse → setelah ~200ms, splice dari state.
   * Kalau user spam delete sebelum animasi selesai, request berikutnya
   * akan langsung remove (skip animasi) supaya nggak tertunda lama.
   */
  const removePart = useCallback(
    (key: string) => {
      if (removingKey) {
        setPartLines((rows) => rows.filter((r) => r.key !== key));
        return;
      }
      setRemovingKey(key);
      window.setTimeout(() => {
        setPartLines((rows) => rows.filter((r) => r.key !== key));
        setRemovingKey(null);
      }, 200);
    },
    [removingKey],
  );

  /**
   * Step 1 dari delete flow: tutup detail sheet, buka confirm dialog.
   * Tidak panggil API di sini — destructive action selalu butuh konfirmasi
   * eksplisit. Pattern-nya sama persis dengan delete vehicle di Overview
   * (lihat `app/overview/page.tsx`).
   */
  const requestDeleteRecord = useCallback((r: ServiceRecord) => {
    setSelectedRecord(null);
    setPendingDeleteRecord(r);
  }, []);

  /**
   * Step 2: user konfirmasi. Optimistic update — record langsung hilang
   * dari list, di-restore kalau API gagal. Toast feedback di kedua jalur.
   */
  const confirmDeleteRecord = useCallback(async () => {
    const target = pendingDeleteRecord;
    if (!target || deletingRecord) return;

    setDeletingRecord(true);
    // Tutup row yang ter-swipe sebelum optimistic remove agar tidak ada flash
    // visual ketika item menghilang dari DOM.
    setOpenSwipeId(null);
    const previous = records;
    setRecords((prev) => prev.filter((x) => x.id !== target.id));

    try {
      await deleteServiceRecord(id, target.id);
      toast.success("Riwayat servis dihapus");
    } catch (err) {
      setRecords(previous);
      toast.error(err instanceof Error ? err.message : "Gagal menghapus riwayat servis");
    } finally {
      setDeletingRecord(false);
      setPendingDeleteRecord(null);
    }
  }, [id, pendingDeleteRecord, deletingRecord, records]);

  const openEditModal = useCallback((r: ServiceRecord) => {
    setSelectedRecord(null);
    setEditingId(r.id);
    setForm({
      serviced_at: r.serviced_at,
      mileage_at_service: String(r.mileage_at_service),
      service_type: r.service_type,
      description: r.description ?? "",
      location: r.location ?? "",
      changed_engine_oil: r.changed_engine_oil,
      changed_gearbox_oil: r.changed_gearbox_oil,
    });
    // Pisahkan part oli (untuk price state khusus) dari free-form parts.
    const { enginePrice, gearboxPrice, remaining } = splitOilFromParts(r.parts);
    setOilPrices({ engine: enginePrice, gearbox: gearboxPrice });
    setPartLines(recordToPartLines(remaining));
    setRemovingKey(null);

    // Derive chipPick dari record. "Ganti oli" hanya kalau record memang
    // *hanya* berisi ganti oli — tidak ada free-form parts dan tidak heavy.
    // Kalau ada parts atau heavy, asumsikan user dulu pilih ringan/besar
    // dan kebetulan ikut ganti oli (ini yang dimaksud user di chat).
    const hasOilFlag = r.changed_engine_oil || r.changed_gearbox_oil;
    const hasFreeformParts = remaining.length > 0;
    let derivedChip: ServiceChip;
    if (r.service_type === "heavy") {
      derivedChip = "heavy";
    } else if (hasOilFlag && !hasFreeformParts) {
      derivedChip = "oil_change";
    } else {
      derivedChip = "light";
    }
    setChipPick(derivedChip);
    // Edit reveals Advanced — user perlu lihat tanggal/lokasi/catatan.
    // Parts collapse: hanya buka kalau ada free-form part (oli sudah di
    // section sendiri di Quick mode, jadi adanya oli saja tidak bikin
    // parts panel terbuka).
    setAdvancedOpen(true);
    setPartsOpen(remaining.length > 0);
    setAddModalOpen(true);
  }, []);

  const load = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    const d = await fetchVehicleDetail(id as string);
    if (!d) {
      setDetail(null);
      setRecords([]);
      return false;
    }
    setDetail(d);
    try {
      const list = await fetchServiceRecordsForVehicle(id as string);
      setRecords(list);
    } catch {
      setRecords([]);
    }
    return true;
  }, [id]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/access");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ok = await load();
        if (cancelled) return;
        if (!ok) router.replace("/dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, router, load]);

  useEffect(() => {
    if (!addModalOpen) return;
    const t = window.setTimeout(() => modalKmRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [addModalOpen]);

  useEffect(() => {
    if (!addModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAddModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addModalOpen, closeAddModal]);

  useEffect(() => {
    if (!addModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [addModalOpen]);

  useEffect(() => {
    if (!addModalOpen) return;
    let cancelled = false;
    fetchKnownServiceLocations()
      .then((list) => {
        if (!cancelled) setLocationSuggestions(list);
      })
      .catch(() => {
        if (!cancelled) setLocationSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [addModalOpen]);

  /**
   * Original KM dari record yang sedang diedit. `null` saat add. Dipakai
   * untuk lenient-update: kalau user tidak mengubah KM record lama (yang
   * mungkin < currentKm karena record historis), tetap diizinkan save —
   * supaya user bisa edit catatan/lokasi/dll tanpa di-block validasi.
   */
  const editingOriginalKm =
    editingId != null ? records.find((r) => r.id === editingId)?.mileage_at_service ?? null : null;

  /**
   * Hasil validasi KM. Mengembalikan pesan error (string) atau `null` (valid).
   * - Empty / non-numeric → "wajib"
   * - Negatif → invalid
   * - Insert: km < currentKm → "tidak boleh mundur"
   * - Update + km diubah: km < currentKm → "tidak boleh mundur"
   * - Update + km tidak diubah → diizinkan (kasus historis)
   */
  const kmError: string | null = (() => {
    const raw = form.mileage_at_service.trim();
    if (raw === "") return "Masukkan KM odometer";
    const km = parseInt(raw, 10);
    if (Number.isNaN(km) || km < 0) return "KM tidak valid";
    const isUpdate = editingOriginalKm != null;
    const kmUnchanged = isUpdate && km === editingOriginalKm;
    if (!kmUnchanged && km < currentKm) {
      return `KM minimal ${formatKm(currentKm)} (KM saat ini)`;
    }
    return null;
  })();
  const kmValid = () => kmError === null;

  const buildPayload = (): {
    service_type: "light" | "heavy";
    description?: string;
    location?: string;
    changed_engine_oil: boolean;
    changed_gearbox_oil: boolean;
    mileage_at_service: number;
    serviced_at: string;
    parts: ServicePartLine[];
  } | null => {
    const km = parseInt(form.mileage_at_service, 10);
    if (form.mileage_at_service.trim() === "" || Number.isNaN(km) || km < 0) {
      toast.error("Masukkan KM servis (angka ≥ 0)");
      return null;
    }
    // Forward-only guard di payload builder, redundan dengan `kmError`
    // di UI tapi defense-in-depth — kalau ada race / state bug yang lolos
    // dari disabled button, tetap di-block sebelum hit network.
    if (kmError) {
      toast.error(kmError);
      return null;
    }
    if (!form.serviced_at) {
      toast.error("Pilih tanggal servis");
      return null;
    }
    const description = form.description.trim() || undefined;
    // Free-form parts dari panel "Tambah part & biaya". Filter defensif:
    // kalau slug oli ikut bocor ke sini (mis. data legacy), dibuang —
    // sumber-of-truth oli adalah `oilPrices` + flag.
    const freeformParts = normalizePartLines(partLines).filter(
      (p) =>
        p.kind_slug !== OIL_PART_SLUGS.engine && p.kind_slug !== OIL_PART_SLUGS.gearbox,
    );
    // Synthesize oil part lines dari flag + price state. Hanya simpan
    // kalau price > 0 — flag saja (tanpa harga) sudah cukup untuk
    // tracking di halaman Oil condition; menyimpan price=0 hanya bikin
    // noise di JSONB.
    const oilParts: ServicePartLine[] = [];
    if (form.changed_engine_oil) {
      const enginePrice = Math.max(
        0,
        parseInt(digitsOnly(oilPrices.engine, 12), 10) || 0,
      );
      if (enginePrice > 0) {
        oilParts.push({
          name: "Oli mesin",
          price: enginePrice,
          kind_slug: OIL_PART_SLUGS.engine,
        });
      }
    }
    if (form.changed_gearbox_oil) {
      const gearboxPrice = Math.max(
        0,
        parseInt(digitsOnly(oilPrices.gearbox, 12), 10) || 0,
      );
      if (gearboxPrice > 0) {
        oilParts.push({
          name: "Oli gardan",
          price: gearboxPrice,
          kind_slug: OIL_PART_SLUGS.gearbox,
        });
      }
    }
    const parts = [...oilParts, ...freeformParts];
    const location = form.location.trim() || undefined;
    return {
      service_type: form.service_type,
      description,
      location,
      changed_engine_oil: form.changed_engine_oil,
      changed_gearbox_oil: form.changed_gearbox_oil,
      mileage_at_service: km,
      serviced_at: form.serviced_at,
      parts,
    };
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!id) return;
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      let saved: ServiceRecord;
      if (editingId) {
        saved = await updateServiceRecord(id as string, editingId, payload);
        toast.success("Riwayat servis diperbarui");
      } else {
        saved = await insertServiceRecord(id as string, payload);
        toast.success("Riwayat servis tersimpan");
      }
      // Side effect: kalau KM service > KM saat ini, treat as new
      // mileage data point. Trigger DB (`enforce_mileage_monotonic` +
      // `sync_vehicle_current_mileage`) yang akan handle:
      // - Insert ditolak kalau bukan strict-greater (kasus race condition,
      //   defensive — kita sudah cek via `currentKm` di client)
      // - `vehicles.current_mileage_km` ikut naik via trigger AFTER INSERT
      // Failure di sini tidak rollback service record — log saja & beri
      // toast warning. Service record adalah source of truth utama.
      if (payload.mileage_at_service > currentKm) {
        try {
          await insertMileage(id as string, payload.mileage_at_service);
        } catch (err) {
          console.warn("Failed to sync vehicle KM after service save:", err);
          toast.warning("Servis tersimpan, tapi KM kendaraan gagal ter-update");
        }
      }

      // Auto-reset matching reminders. Best-effort — failures here don't
      // unwind the saved record. Surface an Undo toast so the user can
      // revert if the matching was wrong (e.g. a "ringan" entry that
      // shouldn't have reset their oil reminder).
      try {
        const resets = await resetRemindersAfterServiceRecord(id as string, saved);
        if (resets.length > 0) {
          const labels = resets
            .map(
              ({ reminder }) =>
                getReminderPreset(reminder.preset_slug)?.label ?? "reminder",
            )
            .join(", ");
          const description =
            resets.length === 1
              ? `${labels} di-reset dari servis ini.`
              : `${resets.length} reminder di-reset (${labels}).`;
          toast.success("Reminder direset", {
            description,
            // 12s gives the user time to notice & undo without lingering.
            duration: 12_000,
            action: {
              label: "Undo",
              onClick: () => {
                void (async () => {
                  try {
                    await Promise.all(
                      resets.map(({ snapshotId }) => restoreReminderFromReset(snapshotId)),
                    );
                    toast.success("Reset dibatalkan");
                    // Notify other surfaces (reminder page) that data
                    // changed so they refresh from server.
                    window.dispatchEvent(new CustomEvent("mr:vehicle-data-changed"));
                  } catch (undoErr) {
                    toast.error(
                      undoErr instanceof Error
                        ? undoErr.message
                        : "Gagal membatalkan reset",
                    );
                  }
                })();
              },
            },
          });
          // Same event so the bell badge / reminder list re-fetch.
          window.dispatchEvent(new CustomEvent("mr:vehicle-data-changed"));
        }
      } catch (resetErr) {
        console.warn("Auto-reset reminders failed:", resetErr);
      }

      closeAddModal();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) return null;

  const saveDisabled = saving || !kmValid();
  const totalFromRecord = (r: ServiceRecord) => sumParts(r.parts);

  return (
    <div className="flex min-h-screen flex-col">
      {/* pb-32 reserves space for fixed BottomNav so empty state centers
          dalam visible area (bukan di balik nav). Sama dengan layout di
          Overview page. */}
      <main className="flex flex-1 flex-col px-4 pb-32 pt-5 sm:px-6">
        <button
          type="button"
          onClick={() => router.push(`/vehicles/${id}`)}
          className={`mb-4 self-start rounded-lg px-1 py-0.5 text-sm font-semibold text-(--color-text-secondary) hover:bg-(--color-surface) hover:text-(--color-text) ${btnPress}`}
        >
          ← Kembali ke detail
        </button>

        {loading || !detail ? (
          <DetailSkeleton />
        ) : (
          <div className="flex flex-1 flex-col gap-6">
            <header className="space-y-3">
              <span className="inline-flex max-w-full items-center rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1 text-xs font-semibold text-(--color-text-secondary)">
                {detail.vehicle.name}
              </span>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-(--color-text)">Riwayat Servis</h1>
                  <p className="mt-1 text-sm text-(--color-text-secondary)">Catat &amp; lihat histori perawatan kendaraan</p>
                </div>
                {/* CTA "Tambah servis" hanya muncul kalau sudah ada record —
                    menyamai pattern di Overview page: empty state punya CTA
                    sendiri di tengah, jadi tidak perlu duplikat di header. */}
                {records.length > 0 ? (
                  <AddServiceButton onClick={openAddModal} label="Tambah servis" />
                ) : null}
              </div>
            </header>

            {records.length === 0 ? (
              // Empty state — flex-1 + items/justify-center membuatnya
              // berada di tengah area konten (di bawah header) sampai
              // sebelum BottomNav. Heading "Riwayat servis" sengaja
              // di-skip karena duplikat dengan judul page besar.
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-dashed border-(--color-border) bg-(--color-surface)/80 px-6 py-10 text-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-primary-soft) text-(--color-primary)"
                    aria-hidden
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-(--color-text)">Belum ada riwayat servis</p>
                    <p className="mt-1 text-sm text-(--color-text-secondary)">Tambahkan servis pertama kendaraanmu</p>
                  </div>
                  <AddServiceButton onClick={openAddModal} label="Tambah servis" />
                </div>
              </div>
            ) : (
              <section className="space-y-4">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted)">Riwayat servis</h2>
                {/*
                  Memakai <div role="list"> alih-alih <ul>/<li> agar SwipeableRow
                  (yang merender <div> sendiri) tidak menghasilkan markup
                  <ul><div>...</div></ul> yang invalid. Semantic list dipertahankan
                  via ARIA roles, dan polanya konsisten dengan halaman Overview.
                */}
                <div role="list" className="flex flex-col gap-4">
                  {records.map((r) => {
                    const total = totalFromRecord(r);
                    const desc = r.description?.trim() ?? "";
                    const descOpen = !!expandedDescById[r.id];
                    return (
                      <SwipeableRow
                        key={r.id}
                        isOpen={openSwipeId === r.id}
                        onOpenChange={(open) =>
                          setOpenSwipeId(open ? r.id : openSwipeId === r.id ? null : openSwipeId)
                        }
                        onAction={() => requestDeleteRecord(r)}
                        disabled={deletingRecord}
                      >
                        <div
                          role="listitem"
                          className="relative bg-(--color-surface) shadow-sm transition-shadow duration-200 hover:shadow-md"
                        >
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className={`absolute right-2 top-2 z-10 rounded-lg p-2 text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-500 dark:hover:bg-zinc-800/90 dark:hover:text-zinc-300 ${btnPress}`}
                            aria-label="Ubah servis"
                          >
                            <PencilEditIcon className="h-5 w-5" />
                          </button>

                          <div className="min-w-0 px-4 pb-3 pr-12 pt-3">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedRecord(r)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedRecord(r);
                                }
                              }}
                              className="cursor-pointer rounded-lg text-left outline-none transition-colors duration-200 hover:bg-(--color-surface-alt)/70 focus-visible:ring-2 focus-visible:ring-(--color-primary)/30 focus-visible:ring-inset"
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted)">
                                {formatServiceDate(r.serviced_at)}
                              </p>
                              <p className="mt-2 text-sm font-bold tabular-nums tracking-tight text-(--color-text)">
                                KM {formatKm(r.mileage_at_service)}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-(--color-text-secondary)">{recordTitle(r)}</p>
                              {/* Badge "Ganti oli mesin/gardan" sengaja tidak ditampilkan di
                                list view — info ini sudah ada di detail bottom sheet
                                (terbuka via tap card), supaya kartu lebih ringkas dan
                                memuat lebih banyak record dalam satu layar. */}
                              {r.location ? (
                                <p className="mt-1.5 inline-flex max-w-full items-center gap-1 text-xs text-(--color-text-muted)">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  <span className="truncate">{r.location}</span>
                                </p>
                              ) : null}
                              {total > 0 ? (
                                <p className="mt-2 text-sm font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                                  Total {formatIdr(total)}
                                </p>
                              ) : null}
                            </div>

                            {desc ? (
                              <div className="mt-2">
                                <div
                                  className={`transition-[max-height] duration-300 ease-out motion-reduce:transition-none ${descOpen
                                      ? "max-h-[min(50vh,28rem)] overflow-y-auto"
                                      : "max-h-[2.75rem] overflow-hidden"
                                    }`}
                                >
                                  <button
                                    type="button"
                                    className="block w-full cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)/25"
                                    onClick={() => setSelectedRecord(r)}
                                  >
                                    <p
                                      className={`whitespace-pre-line break-words text-xs leading-relaxed text-(--color-text-secondary) ${descOpen ? "" : "line-clamp-2"
                                        }`}
                                    >
                                      {desc}
                                    </p>
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  aria-expanded={descOpen}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    toggleDescriptionExpanded(r.id);
                                  }}
                                  className={`mt-1.5 flex w-full items-center gap-1 text-left text-[11px] font-semibold text-(--color-primary) underline-offset-2 hover:underline ${btnPress}`}
                                >
                                  <span className={`inline-block transition-transform duration-200 ${descOpen ? "rotate-180" : ""}`} aria-hidden>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                      <path
                                        fillRule="evenodd"
                                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </span>
                                  {descOpen ? "Sembunyikan" : "Lihat detail"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </SwipeableRow>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {addModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-service-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40 transition-opacity duration-150 hover:bg-black/45"
            aria-label="Tutup"
            onClick={closeAddModal}
          />
          {/* max-h 80dvh per spec ("Maks tinggi: 80% layar"). Modal pakai
              shadow-2xl tanpa border supaya kesan ringan & modern. */}
          <div className="relative z-10 flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-2xl bg-(--color-bg) shadow-2xl sm:mx-4 sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--color-border)/60 px-5 py-4">
              <div>
                <h2 id="add-service-title" className="text-lg font-extrabold text-(--color-text)">
                  {editingId ? "Ubah servis" : "Tambah servis"}
                </h2>
                {detail ? (
                  <p className="mt-0.5 text-xs text-(--color-text-secondary)">{detail.vehicle.name}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                className={`rounded-lg p-2 text-(--color-text-muted) hover:bg-(--color-surface) hover:text-(--color-text) ${btnPress}`}
                aria-label="Tutup"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5 pb-24">
                {/* ===== QUICK ADD — selalu tampil. Cukup KM + chip = valid record. ===== */}

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="modal-km"
                      className="text-[10px] font-bold text-(--color-text-muted)"
                    >
                      KM odometer
                    </label>
                    {currentKm > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold tabular-nums text-(--color-text-muted)">
                          Saat ini: {formatKm(currentKm)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              mileage_at_service: String(currentKm),
                            }))
                          }
                          className="text-[10px] font-bold uppercase tracking-wide text-(--color-primary) transition-opacity hover:opacity-80 active:opacity-60"
                          aria-label={`Set KM ke ${formatKm(currentKm)}`}
                        >
                          SET
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      ref={modalKmRef}
                      id="modal-km"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      pattern="[0-9]*"
                      value={form.mileage_at_service}
                      onChange={(e) =>
                        setForm({ ...form, mileage_at_service: digitsOnly(e.target.value, 9) })
                      }
                      onKeyDown={(e) => {
                        const nav = [
                          "Backspace",
                          "Delete",
                          "Tab",
                          "Escape",
                          "Enter",
                          "ArrowLeft",
                          "ArrowRight",
                          "Home",
                          "End",
                        ];
                        if (nav.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
                        if (/^\d$/.test(e.key)) return;
                        e.preventDefault();
                      }}
                      aria-invalid={kmError !== null && form.mileage_at_service.trim() !== ""}
                      aria-describedby={kmError ? "modal-km-error" : undefined}
                      className={`${inputClass} py-3.5 pr-12 text-base font-semibold tabular-nums ${kmError && form.mileage_at_service.trim() !== ""
                          ? "ring-red-400 focus:ring-red-400/60"
                          : ""
                        }`}
                      placeholder="Misal: 12500"
                    />
                    <span
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)"
                      aria-hidden
                    >
                      km
                    </span>
                  </div>
                  {/* Inline error: hanya tampil setelah user mulai ngetik —
                      hindari "wajib" muncul di state initial yang masih kosong. */}
                  {kmError && form.mileage_at_service.trim() !== "" ? (
                    <p
                      id="modal-km-error"
                      className="mt-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400"
                    >
                      {kmError}
                    </p>
                  ) : null}
                </div>

                {/* Tanggal + Lokasi — metadata "kapan & di mana". Bukan
                    detail opsional, jadi taruh di Quick (bukan di balik
                    "Tambahkan detail"). Default tanggal = hari ini. */}
                <div>
                  <label className="text-[10px] font-bold text-(--color-text-muted)">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    required
                    value={form.serviced_at}
                    onChange={(e) => setForm({ ...form, serviced_at: e.target.value })}
                    className={`${inputClass} mt-1.5`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="modal-location"
                    className="text-[10px] font-bold text-(--color-text-muted)"
                  >
                    Lokasi <span className="font-medium normal-case text-(--color-text-muted)/80">(opsional)</span>
                  </label>
                  <div className="relative mt-1.5">
                    <span
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-(--color-text-muted)"
                      aria-hidden
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <input
                      id="modal-location"
                      type="text"
                      autoComplete="off"
                      list="service-location-suggestions"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      maxLength={120}
                      placeholder="Mis. AHASS Cibubur"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                  {locationSuggestions.length > 0 ? (
                    <datalist id="service-location-suggestions">
                      {locationSuggestions.map((loc) => (
                        <option key={loc} value={loc} />
                      ))}
                    </datalist>
                  ) : null}
                </div>

                <div>
                  <span className="text-[10px] font-bold text-(--color-text-muted)">
                    Jenis servis
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Jenis servis"
                    className="mt-2 flex flex-wrap gap-2"
                  >
                    {QUICK_CHIPS.map((c) => {
                      const isActive = activeChip === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => applyChip(c.id)}
                          className={`rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-all duration-150 ${btnPress} ${isActive
                              ? "bg-(--color-primary-soft) text-(--color-primary) ring-(--color-primary)/45 shadow-sm"
                              : "bg-(--color-surface) text-(--color-text-secondary) ring-(--color-border)/40 hover:ring-(--color-primary)/40"
                            }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ===== Ganti oli — selalu tampil di Quick.
                    Tampak prominent saat chip "Ganti oli" aktif (auto-tick),
                    tetap accessible saat chip ringan/besar untuk kombinasi
                    servis + ganti oli. Setiap baris: checkbox + price
                    inline. Price input hanya muncul saat checkbox aktif. */}
                <fieldset
                  className={`flex flex-col gap-2.5 rounded-2xl p-4 shadow-sm transition-colors duration-200 ${activeChip === "oil_change"
                      ? "bg-(--color-primary-soft)/40 ring-1 ring-(--color-primary)/30"
                      : "bg-(--color-surface)/60"
                    }`}
                >
                  <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">
                    Ganti oli
                    {activeChip !== "oil_change" && (
                      <span className="ml-1 text-[10px] font-medium normal-case text-(--color-text-muted)/80">
                        (opsional)
                      </span>
                    )}
                  </legend>

                  {(
                    [
                      {
                        which: "engine" as const,
                        flagKey: "changed_engine_oil" as const,
                        label: "Oli mesin",
                        priceRef: oilEnginePriceRef,
                        priceId: "modal-oil-engine-price",
                        // Engine row selalu tampil — semua kategori motor
                        // punya oli mesin.
                        visible: true,
                      },
                      {
                        which: "gearbox" as const,
                        flagKey: "changed_gearbox_oil" as const,
                        label: "Oli gardan",
                        priceRef: oilGearboxPriceRef,
                        priceId: "modal-oil-gearbox-price",
                        // Gearbox row hanya muncul untuk kategori yang
                        // punya interval gardan (matic). Untuk record
                        // legacy yang sudah ter-tick, tetap tampilkan
                        // supaya user bisa edit/uncheck.
                        visible: hasGearboxInterval || form.changed_gearbox_oil,
                      },
                    ] as const
                  )
                    .filter((row) => row.visible)
                    .map((row) => {
                      const active = form[row.flagKey];
                      return (
                        <div
                          key={row.which}
                          className={`flex items-center gap-2 rounded-xl bg-(--color-bg) px-3 py-2 ring-1 transition-all duration-150 ${active
                              ? "ring-(--color-primary)/45"
                              : "ring-(--color-border)/40"
                            }`}
                        >
                          {/* Checkbox + label di kiri (flex-1 supaya nggak nge-push
                              price input saat row width berubah). Price input di
                              kanan, hanya tampil saat checkbox aktif — biar hemat
                              space dan satu baris saja. */}
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={(e) => toggleOilFlag(row.which, e.target.checked)}
                              className="h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                            />
                            <span
                              className={`truncate font-semibold ${active ? "text-(--color-primary)" : "text-(--color-text)"
                                }`}
                            >
                              {row.label}
                            </span>
                          </label>
                          {active && (
                            <div className="relative w-32 shrink-0 sm:w-36">
                              <label className="sr-only" htmlFor={row.priceId}>
                                Harga {row.label.toLowerCase()}
                              </label>
                              <span
                                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-(--color-text-muted)"
                                aria-hidden
                              >
                                Rp
                              </span>
                              <input
                                ref={row.priceRef}
                                id={row.priceId}
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                value={formatThousandsId(oilPrices[row.which])}
                                onChange={(e) =>
                                  setOilPrices((p) => ({
                                    ...p,
                                    [row.which]: digitsOnly(e.target.value, 12),
                                  }))
                                }
                                placeholder="0"
                                className={`${inputClass} py-2 pl-8 pr-2 text-right tabular-nums`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {/* Subtotal oli — tampil hanya saat ada nilai untuk ngasih
                      sense biaya total, tanpa noise saat kosong. */}
                  {(() => {
                    const eng = form.changed_engine_oil
                      ? parseInt(digitsOnly(oilPrices.engine, 12), 10) || 0
                      : 0;
                    const gear = form.changed_gearbox_oil
                      ? parseInt(digitsOnly(oilPrices.gearbox, 12), 10) || 0
                      : 0;
                    const total = eng + gear;
                    if (total <= 0) return null;
                    return (
                      <p className="px-1 pt-1 text-xs font-bold tabular-nums text-(--color-text)">
                        Subtotal oli: {formatIdr(total)}
                      </p>
                    );
                  })()}
                </fieldset>

                {/* ===== ADVANCED toggle ===== */}
                {!advancedOpen ? (
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(true)}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl bg-(--color-surface) px-4 py-3 text-xs font-bold text-(--color-text-secondary) shadow-sm transition-all duration-200 hover:text-(--color-primary) hover:shadow-md ${btnPress}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="h-4 w-4"
                      aria-hidden
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Tambahkan detail
                  </button>
                ) : (
                  <section
                    aria-label="Detail tambahan"
                    className="flex flex-col gap-4 rounded-2xl bg-(--color-surface)/50 p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">
                        Detail tambahan
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdvancedOpen(false)}
                        className={`rounded-full bg-(--color-primary-soft) px-2.5 py-1 text-[11px] font-semibold text-(--color-primary) transition-all duration-150 hover:brightness-95 ${btnPress}`}
                      >
                        Sembunyikan
                      </button>
                    </div>

                    {/* Catatan */}
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">
                        Catatan
                      </label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={2}
                        className={`${inputClass} mt-1.5 resize-none`}
                        placeholder="Kondisi, keluhan, dll."
                      />
                    </div>

                    {/* Parts — nested collapse, default tertutup. Oli tidak
                        ada di sini — sudah punya section sendiri di Quick. */}
                    {!partsOpen ? (
                      <button
                        type="button"
                        onClick={() => setPartsOpen(true)}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-xl bg-(--color-surface) px-4 py-3 text-xs font-bold text-(--color-text-secondary) shadow-sm transition-all duration-200 hover:text-(--color-primary) hover:shadow-md ${btnPress}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          className="h-4 w-4"
                          aria-hidden
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Tambah part &amp; biaya
                      </button>
                    ) : (
                      <section className="flex flex-col gap-4 rounded-xl bg-(--color-surface) p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">
                            Part &amp; biaya
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPartsOpen(false);
                              setPartLines([]);
                              setRemovingKey(null);
                            }}
                            className={`rounded-full bg-(--color-primary-soft) px-2.5 py-1 text-[11px] font-semibold text-(--color-primary) transition-all duration-150 hover:brightness-95 ${btnPress}`}
                          >
                            Tutup
                          </button>
                        </div>

                        {/* Quick-add chips — tap chip langsung tambah ke list +
                            auto-focus price input. Disabled ketika slug-nya
                            sudah ada di list (anti-duplikat). */}
                        {(() => {
                          const chips = partKindsForChips(detail?.motorcycle_category?.slug);
                          if (chips.length === 0) return null;
                          const usedSlugs = new Set(
                            partLines.map((r) => r.kind_slug).filter((s): s is string => !!s),
                          );
                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {chips.map((kind) => {
                                const used = usedSlugs.has(kind.slug);
                                return (
                                  <button
                                    key={kind.slug}
                                    type="button"
                                    disabled={used}
                                    onClick={() => addCommonPart(kind)}
                                    aria-pressed={used}
                                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-150 ${btnPress} ${used
                                        ? "cursor-not-allowed bg-(--color-primary-soft) text-(--color-primary)"
                                        : "bg-(--color-bg) text-(--color-text-secondary) ring-1 ring-(--color-border)/40 hover:bg-(--color-primary-soft) hover:text-(--color-primary) hover:ring-(--color-primary)/40"
                                      }`}
                                  >
                                    <span aria-hidden className="text-[12px] leading-none">
                                      {used ? "✓" : "+"}
                                    </span>
                                    {kind.chip_label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* List parts atau empty state */}
                        {partLines.length === 0 ? (
                          <p className="rounded-lg bg-(--color-bg)/60 px-3 py-4 text-center text-xs text-(--color-text-muted)">
                            Pilih part di atas untuk menambahkan
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {partLines.map((line) => {
                              const isRemoving = removingKey === line.key;
                              return (
                                <li
                                  key={line.key}
                                  className={`grid grid-cols-[minmax(0,1fr)_7.5rem_2rem] items-center gap-2 overflow-hidden transition-all duration-200 ease-out ${isRemoving
                                      ? "max-h-0 -translate-x-2 opacity-0"
                                      : "max-h-20 translate-x-0 opacity-100"
                                    }`}
                                >
                                  <label className="sr-only" htmlFor={`part-name-${line.key}`}>
                                    Nama part
                                  </label>
                                  <input
                                    id={`part-name-${line.key}`}
                                    type="text"
                                    value={line.name}
                                    onChange={(e) =>
                                      setPartLines((rows) =>
                                        rows.map((r) =>
                                          r.key === line.key ? { ...r, name: e.target.value } : r,
                                        ),
                                      )
                                    }
                                    placeholder="Nama part"
                                    className={`${inputClass} min-w-0 px-3 py-2`}
                                  />
                                  <div className="relative">
                                    <label className="sr-only" htmlFor={`part-price-${line.key}`}>
                                      Harga
                                    </label>
                                    <span
                                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-(--color-text-muted)"
                                      aria-hidden
                                    >
                                      Rp
                                    </span>
                                    <input
                                      id={`part-price-${line.key}`}
                                      type="text"
                                      inputMode="numeric"
                                      autoComplete="off"
                                      value={formatThousandsId(line.price)}
                                      onChange={(e) =>
                                        setPartLines((rows) =>
                                          rows.map((r) =>
                                            r.key === line.key
                                              ? { ...r, price: digitsOnly(e.target.value, 12) }
                                              : r,
                                          ),
                                        )
                                      }
                                      placeholder="Masukkan harga"
                                      className={`${inputClass} py-2 pl-8 pr-2 text-right tabular-nums`}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removePart(line.key)}
                                    disabled={isRemoving}
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-all duration-150 hover:text-red-500 dark:text-(--color-text-muted) dark:hover:text-red-400 ${btnPress}`}
                                    aria-label="Hapus baris"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className="h-4 w-4"
                                    >
                                      <path
                                        d="M3 6h18M8 6V4h8v2m-9 4v10m10-10v10M10 11v6M14 11v6"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {/* "+ Tambah part lain" — secondary, kecil, tidak menonjol */}
                        <button
                          type="button"
                          onClick={addBlankPart}
                          className={`self-start text-xs font-semibold text-(--color-text-secondary) transition-colors duration-150 hover:text-(--color-primary) ${btnPress}`}
                        >
                          + Tambah part lain
                        </button>

                        {/* Total — bold, lebih besar, highlighted */}
                        {normalizePartLines(partLines).length > 0 ? (
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-(--color-primary-soft)/60 px-4 py-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-(--color-primary)">
                              Total
                            </span>
                            <span className="text-base font-extrabold tabular-nums text-(--color-primary)">
                              {formatIdr(sumParts(normalizePartLines(partLines)))}
                            </span>
                          </div>
                        ) : null}
                      </section>
                    )}
                  </section>
                )}
              </div>

              {/* Sticky save — full-width, primary, dengan loading + disable. */}
              <div className="shrink-0 bg-(--color-bg) p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.12)]">
                <button
                  type="submit"
                  disabled={saveDisabled}
                  className={`w-full rounded-xl bg-(--color-primary) py-3.5 text-sm font-bold text-white shadow-md shadow-(--color-primary)/25 transition-all duration-200 hover:brightness-110 hover:shadow-lg ${btnPress} ${btnDisabled}`}
                >
                  {saving ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Simpan Servis"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-detail-title"
        >
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Tutup" onClick={() => setSelectedRecord(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-bg) p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 id="service-detail-title" className="text-lg font-extrabold text-(--color-text)">
                Detail servis
              </h3>
              {/* Trash icon — soft red sesuai pola di vehicles/[id]/page.tsx
                  (lihat tombol delete kendaraan). Confirm dialog di-handle
                  via state `pendingDeleteRecord` supaya destructive action
                  butuh klik dua kali (tap trash → konfirmasi). */}
              <button
                type="button"
                onClick={() => requestDeleteRecord(selectedRecord)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 transition-colors duration-150 hover:bg-red-100 dark:bg-red-900/15 dark:text-red-400 dark:hover:bg-red-900/30 ${btnPress}`}
                aria-label="Hapus riwayat servis"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4.5 w-4.5"
                  aria-hidden
                >
                  <path d="M3 6h18M8 6V4h8v2m-9 4v10m10-10v10M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">Tanggal</dt>
                <dd className="mt-1 font-semibold text-(--color-text)">{formatServiceDate(selectedRecord.serviced_at)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">KM</dt>
                <dd className="mt-1 font-semibold tabular-nums text-(--color-text)">{formatKm(selectedRecord.mileage_at_service)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">Jenis</dt>
                <dd className="mt-1 font-semibold text-(--color-text)">{recordTitle(selectedRecord)}</dd>
              </div>
              {oilChangeLabel(selectedRecord) ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">Ganti oli</dt>
                  <dd className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M12 2v6M5 8a7 7 0 0 0 14 0M12 8v14" />
                    </svg>
                    {oilChangeLabel(selectedRecord)}
                  </dd>
                </div>
              ) : null}
              {selectedRecord.location?.trim() ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">Lokasi</dt>
                  <dd className="mt-1 inline-flex items-start gap-1.5 break-words font-semibold text-(--color-text)">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-(--color-text-muted)" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{selectedRecord.location}</span>
                  </dd>
                </div>
              ) : null}
              {selectedRecord.description?.trim() ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">Catatan</dt>
                  <dd className="mt-1 whitespace-pre-line break-words leading-relaxed text-(--color-text)">{selectedRecord.description}</dd>
                </div>
              ) : null}
              {selectedRecord.parts.length > 0 ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">Part &amp; biaya</dt>
                  <dd className="mt-2 space-y-1.5">
                    {selectedRecord.parts.map((p, i) => (
                      <div key={`${p.name}-${i}`} className="flex justify-between gap-3 text-(--color-text)">
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="shrink-0 tabular-nums font-semibold">{formatIdr(p.price)}</span>
                      </div>
                    ))}
                    <p className="border-t border-(--color-border)/60 pt-2 text-base font-bold tabular-nums text-(--color-primary)">
                      Total {formatIdr(sumParts(selectedRecord.parts))}
                    </p>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => {
                  const r = selectedRecord;
                  setSelectedRecord(null);
                  openEditModal(r);
                }}
                className={`w-full rounded-xl bg-(--color-primary) py-3 text-sm font-bold text-white shadow-md shadow-(--color-primary)/20 hover:brightness-110 sm:flex-1 ${btnPress}`}
              >
                Ubah
              </button>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className={`w-full rounded-xl border border-(--color-border) bg-(--color-surface-alt) py-3 text-sm font-bold text-(--color-text) hover:bg-(--color-surface) sm:flex-1 ${btnPress}`}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!pendingDeleteRecord}
        title="Hapus riwayat servis?"
        message={
          pendingDeleteRecord
            ? `Riwayat servis ${formatServiceDate(pendingDeleteRecord.serviced_at)} (KM ${formatKm(pendingDeleteRecord.mileage_at_service)}) akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
            : ""
        }
        confirmLabel={deletingRecord ? "Menghapus…" : "Hapus"}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={() => void confirmDeleteRecord()}
        onCancel={() => {
          if (deletingRecord) return;
          setPendingDeleteRecord(null);
        }}
      />
    </div>
  );
}
