"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  createServiceReceiptSignedUrl,
  deleteServiceRecord,
  fetchKnownServiceLocations,
  fetchServiceRecordsForVehicle,
  fetchVehicleDetail,
  insertMileage,
  insertServiceRecord,
  removeServiceReceipt,
  resetRemindersAfterServiceRecord,
  restoreReminderFromReset,
  updateServiceRecord,
  updateServiceRecordReceiptPath,
  uploadServiceReceipt,
} from "@/lib/supabase";
import { getReminderPreset } from "@/lib/reminder-presets";
import type { ServicePartLine, ServiceRecord, VehicleDetail } from "@/lib/types";
import { DetailSkeleton } from "@/components/LoadingSkeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import SwipeableRow from "@/components/SwipeableRow";
import { Button, IconButton, Modal, SectionLabel, TextInput } from "@/components/ui";
import { partKindsForChips, type PartKind } from "@/lib/part-kinds";
import type { NotaScanResult } from "@/lib/nota-normalize";
import { NotaScanError, scanNotaFromFile } from "@/lib/nota-scan";
import { mapNotaItemsToFormParts } from "@/lib/nota-item-classify";
import ServiceNotaHero, { type ServiceNotaPhase } from "@/components/ServiceNotaHero";
import { useAppErrorMessage, useTranslation, type TranslationKey } from "@/lib/i18n";
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
  /** Digit string; default "1". */
  qty: string;
  /** Digit string — harga satuan. */
  unit_price: string;
  /** Digit string — total baris (qty × unit_price), derived on edit. */
  price: string;
  /** Tag standar dari chip "Tambah cepat". Null untuk free-text manual. */
  kind_slug: string | null;
};

function newPartLine(overrides?: Partial<Omit<PartLine, "key">>): PartLine {
  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const base: PartLine = {
    key,
    name: "",
    qty: "1",
    unit_price: "",
    price: "",
    kind_slug: null,
  };
  const merged = { ...base, ...overrides, key };
  if (overrides?.unit_price != null || overrides?.qty != null) {
    merged.price = derivedLineTotal(merged.qty, merged.unit_price, merged.price);
  }
  return merged;
}

/** qty × unit_price as digit string; falls back to existing price if unit empty. */
function derivedLineTotal(qtyStr: string, unitPriceStr: string, fallbackPrice = ""): string {
  const qty = Math.max(1, parseInt(digitsOnly(qtyStr, 6), 10) || 1);
  const unit = parseInt(digitsOnly(unitPriceStr, 12), 10) || 0;
  if (unit > 0) return String(qty * unit);
  return digitsOnly(fallbackPrice, 12);
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function digitsOnly(raw: string, maxLen: number) {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

/** Format string angka jadi pemisah ribuan locale-aware. */
function formatThousandsId(digits: string, formatNumber: (n: number) => string): string {
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return formatNumber(n);
}

function sumParts(parts: ServicePartLine[]) {
  return parts.reduce((s, p) => s + (Number.isFinite(p.price) ? Math.max(0, p.price) : 0), 0);
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
  return parts.map((p) => {
    const qty = p.qty != null && p.qty > 0 ? p.qty : 1;
    const unit =
      p.unit_price != null && p.unit_price > 0
        ? p.unit_price
        : p.price > 0
          ? Math.round(p.price / qty)
          : 0;
    const total = p.price > 0 ? p.price : unit * qty;
    return newPartLine({
      name: p.name,
      qty: String(qty),
      unit_price: unit > 0 ? String(unit) : "",
      price: total > 0 ? String(total) : "",
      kind_slug: p.kind_slug ?? null,
    });
  });
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
    .map((l) => {
      const qty = Math.max(1, parseInt(digitsOnly(l.qty, 6), 10) || 1);
      const unit_price = Math.max(0, parseInt(digitsOnly(l.unit_price, 12), 10) || 0);
      const derived = unit_price > 0 ? qty * unit_price : 0;
      const fallback = Math.max(0, parseInt(digitsOnly(l.price, 12), 10) || 0);
      const price = derived > 0 ? derived : fallback;
      const line: ServicePartLine = {
        name: l.name.trim(),
        price,
        kind_slug: l.kind_slug ?? null,
      };
      if (qty !== 1 || unit_price > 0) {
        line.qty = qty;
        line.unit_price = unit_price > 0 ? unit_price : price;
      }
      return line;
    })
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

/** Interaksi ringan — dipakai di tombol kontekstual (chip, link, tile). */
const btnPress = "transition-all duration-150 active:scale-95";

/**
 * Set chip Quick-Add. Disusun module-level supaya stabil identitasnya
 * (tidak re-create per render) dan mudah ditambah/diubah satu tempat.
 */
/** Textarea — native element, harmonized dengan TextInput tokens. */
const textareaClass =
  "w-full resize-none rounded-3xl border border-transparent bg-(--color-surface-alt) px-5 py-4 text-sm text-(--color-text) outline-none transition-colors placeholder:text-(--color-text-muted) focus:border-(--color-text)/20 disabled:opacity-60";

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
function AddServiceButton({
  onClick,
  label,
  sublabel,
}: {
  onClick: () => void;
  label: string;
  sublabel: string;
}) {
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
          {sublabel}
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

function BackArrowIcon({ className }: { className?: string }) {
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

function CloseIcon({ className }: { className?: string }) {
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
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
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
  const { t, formatDate, formatNumber } = useTranslation();
  const describeAppError = useAppErrorMessage();

  const formatServiceDate = useCallback(
    (isoDate: string) =>
      formatDate(isoDate + "T12:00:00", { day: "numeric", month: "short", year: "numeric" }),
    [formatDate],
  );
  const formatKm = useCallback((n: number) => formatNumber(n), [formatNumber]);
  const formatIdr = useCallback(
    (n: number) =>
      formatNumber(n, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }),
    [formatNumber],
  );
  const recordTitle = useCallback(
    (r: ServiceRecord) =>
      r.service_type === "heavy" ? t("serviceHistory.heavyService") : t("serviceHistory.lightService"),
    [t],
  );
  const oilChangeLabel = useCallback(
    (r: ServiceRecord): string | null => {
      if (r.changed_engine_oil && r.changed_gearbox_oil) return t("serviceHistory.oilChangeBoth");
      if (r.changed_engine_oil) return t("serviceHistory.oilChangeEngine");
      if (r.changed_gearbox_oil) return t("serviceHistory.oilChangeGearbox");
      return null;
    },
    [t],
  );
  const quickChips = useMemo(
    (): ReadonlyArray<{ id: ServiceChip; label: string }> => [
      { id: "light", label: t("serviceHistory.chipLight") },
      { id: "heavy", label: t("serviceHistory.chipHeavy") },
      { id: "oil_change", label: t("serviceHistory.chipOil") },
    ],
    [t],
  );
  const modalKmRef = useRef<HTMLInputElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
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
  /** File nota yang akan di-upload ke Storage saat Simpan (hasil Kamera/PDF). */
  const [pendingReceiptFile, setPendingReceiptFile] = useState<File | null>(null);
  /** Path nota yang sudah tersimpan (saat edit). */
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);
  const [ocrPhase, setOcrPhase] = useState<ServiceNotaPhase>("idle");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrDetectedDate, setOcrDetectedDate] = useState<string | null>(null);
  const [ocrDetectedKm, setOcrDetectedKm] = useState<number | null>(null);
  const [expandedPartKey, setExpandedPartKey] = useState<string | null>(null);
  const [partSearch, setPartSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<ServiceRecord | null>(null);
  /** Slide-down dismiss untuk detail bottom sheet (mobile). */
  const [detailDragY, setDetailDragY] = useState(0);
  const [detailDragging, setDetailDragging] = useState(false);
  const detailDragRef = useRef<{
    startY: number;
    lastY: number;
    startT: number;
    pointerId: number;
  } | null>(null);
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
    setPendingReceiptFile(null);
    setExistingReceiptPath(null);
    setOcrPhase("idle");
    setOcrError(null);
    setOcrDetectedDate(null);
    setOcrDetectedKm(null);
    setExpandedPartKey(null);
    setPartSearch("");
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
    setPendingReceiptFile(null);
    setExistingReceiptPath(null);
    setOcrPhase("idle");
    setOcrError(null);
    setOcrDetectedDate(null);
    setOcrDetectedKm(null);
    setExpandedPartKey(null);
    setPartSearch("");
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
        (r) =>
          r.name.trim() === "" &&
          r.unit_price.trim() === "" &&
          r.price.trim() === "" &&
          r.kind_slug == null,
      );
      if (emptyIdx !== -1) {
        targetKey = rows[emptyIdx].key;
        return rows.map((r, i) =>
          i === emptyIdx
            ? { ...r, name: t(kind.chip_label_key), kind_slug: kind.slug }
            : r,
        );
      }
      const fresh = newPartLine({ name: t(kind.chip_label_key), kind_slug: kind.slug });
      targetKey = fresh.key;
      return [...rows, fresh];
    });
    if (targetKey) focusAndScrollById(`part-unit-${targetKey}`);
  }, [t]);

  /**
   * Tambah baris kosong manual (tombol "+ Tambah part lain").
   * Auto-focus name input — chip pakai jalur lain (focus unit price).
   */
  const addBlankPart = useCallback(() => {
    const fresh = newPartLine();
    setPartLines((rows) => [...rows, fresh]);
    focusAndScrollById(`part-name-${fresh.key}`);
  }, []);

  /**
   * Map hasil OCR nota → form:
   * - klasifikasi kind (Gemini + keyword safety) → oli flag / kind_slug / free-text
   * - simpan File untuk upload Storage saat Simpan
   */
  const applyNotaScanResult = useCallback((result: NotaScanResult, file: File) => {
    setPendingReceiptFile(file);
    setPartsOpen(true);
    setAdvancedOpen(true);

    const mapped = mapNotaItemsToFormParts(result.items);
    const lines = mapped.partLines.map((p) =>
      newPartLine({
        name: p.name,
        qty: p.qty,
        unit_price: p.unit_price,
        price: p.price,
        kind_slug: p.kind_slug,
      }),
    );
    setPartLines(lines);
    setOilPrices(mapped.oilPrices);
    setExpandedPartKey(null);
    setOcrDetectedDate(result.serviced_at);
    setOcrDetectedKm(result.odometer_km);

    // Chip intent: murni oli → "Ganti oli"; ada part lain → ringan (default).
    const onlyOil =
      mapped.partLines.length === 0 &&
      (mapped.changed_engine_oil || mapped.changed_gearbox_oil);
    setChipPick(onlyOil ? "oil_change" : "light");

    setForm((f) => {
      const next = { ...f };
      if (result.workshop) next.location = result.workshop;
      if (result.serviced_at) next.serviced_at = result.serviced_at;
      if (result.odometer_km != null && result.odometer_km > 0) {
        next.mileage_at_service = String(result.odometer_km);
      }
      next.changed_engine_oil = mapped.changed_engine_oil;
      next.changed_gearbox_oil = mapped.changed_gearbox_oil;
      if (onlyOil) {
        next.service_type = "light";
      }
      return next;
    });

    if (result.items.length === 0) {
      setOcrPhase("empty");
      setOcrError(t("serviceHistory.ocrEmptyParts"));
    } else {
      setOcrPhase("success");
      setOcrError(null);
      const oilBits = [
        mapped.changed_engine_oil ? t("serviceHistory.ocrEngineOil") : null,
        mapped.changed_gearbox_oil ? t("serviceHistory.ocrGearboxOil") : null,
      ].filter(Boolean);
      const tagged = mapped.partLines.filter((p) => p.kind_slug).length;
      const hint = [
        oilBits.length ? oilBits.join(" + ") : null,
        tagged > 0 ? t("serviceHistory.ocrPartsClassified", { n: tagged }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (hint) {
        toast.message(t("serviceHistory.ocrMapParts"), { description: hint });
      }
    }
  }, [t]);

  const handleNotaFilePick = useCallback(
    async (file: File) => {
      setPendingReceiptFile(file);
      setOcrPhase("processing");
      setOcrError(null);
      setOcrDetectedDate(null);
      setOcrDetectedKm(null);
      try {
        const result = await scanNotaFromFile(file);
        applyNotaScanResult(result, file);
      } catch (err) {
        setOcrPhase("error");
        // Structured error → translate; fallback ke generic message.
        if (err instanceof NotaScanError) {
          setOcrError(t(`notaScanError.${err.code}` as TranslationKey));
        } else {
          setOcrError(t("serviceHistory.ocrReadFailed"));
        }
      }
    },
    [applyNotaScanResult, t],
  );

  const clearNotaFile = useCallback(() => {
    setPendingReceiptFile(null);
    setOcrPhase("idle");
    setOcrError(null);
    setOcrDetectedDate(null);
    setOcrDetectedKm(null);
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
    detailDragRef.current = null;
    setDetailDragging(false);
    setDetailDragY(0);
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
      if (target.receipt_path) {
        try {
          await removeServiceReceipt(target.receipt_path);
        } catch (storageErr) {
          console.warn("Failed to remove receipt from storage:", storageErr);
        }
      }
      await deleteServiceRecord(id, target.id);
      toast.success(t("serviceHistory.toastDeleted"));
    } catch (err) {
      setRecords(previous);
      toast.error(describeAppError(err, t("serviceHistory.toastDeleteFailed")));
    } finally {
      setDeletingRecord(false);
      setPendingDeleteRecord(null);
    }
  }, [id, pendingDeleteRecord, deletingRecord, records, t]);

  const openEditModal = useCallback((r: ServiceRecord) => {
    setSelectedRecord(null);
    setEditingId(r.id);
    setPendingReceiptFile(null);
    setExistingReceiptPath(r.receipt_path ?? null);
    setOcrPhase("idle");
    setOcrError(null);
    setOcrDetectedDate(null);
    setOcrDetectedKm(null);
    setExpandedPartKey(null);
    setPartSearch("");
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

  /** AI upload hero di atas — jangan auto-focus KM (itu men-scroll sheet
   *  ke field odometer dan menyembunyikan area upload). Reset scroll ke top. */
  useEffect(() => {
    if (!addModalOpen) return;
    const t = window.setTimeout(() => {
      if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(t);
  }, [addModalOpen]);

  const closeDetailSheet = useCallback(() => {
    detailDragRef.current = null;
    setDetailDragging(false);
    setDetailDragY(0);
    setSelectedRecord(null);
  }, []);

  useEffect(() => {
    if (!selectedRecord) {
      detailDragRef.current = null;
      setDetailDragging(false);
      setDetailDragY(0);
    }
  }, [selectedRecord]);

  const onDetailDragPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    // Jangan mulai drag dari tombol (hapus).
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    detailDragRef.current = {
      startY: e.clientY,
      lastY: e.clientY,
      startT: Date.now(),
      pointerId: e.pointerId,
    };
    setDetailDragging(true);
  }, []);

  const onDetailDragPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const d = detailDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.lastY = e.clientY;
    setDetailDragY(Math.max(0, e.clientY - d.startY));
  }, []);

  const onDetailDragPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const d = detailDragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dy = Math.max(0, d.lastY - d.startY);
      const elapsed = Math.max(1, Date.now() - d.startT);
      const velocity = dy / elapsed; // px/ms
      detailDragRef.current = null;
      setDetailDragging(false);
      // Threshold jarak atau flick cepat ke bawah.
      if (dy > 110 || (dy > 48 && velocity > 0.55)) {
        closeDetailSheet();
        return;
      }
      setDetailDragY(0);
    },
    [closeDetailSheet],
  );

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
    if (raw === "") return t("serviceHistory.errorEnterOdometerKm");
    const km = parseInt(raw, 10);
    if (Number.isNaN(km) || km < 0) return t("serviceHistory.errorInvalidKm");
    const isUpdate = editingOriginalKm != null;
    const kmUnchanged = isUpdate && km === editingOriginalKm;
    if (!kmUnchanged && km < currentKm) {
      return t("serviceHistory.errorKmMin", { km: formatKm(currentKm) });
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
      toast.error(t("serviceHistory.toastEnterServiceKm"));
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
      toast.error(t("serviceHistory.toastSelectDate"));
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
          name: t("serviceHistory.partNameEngineOil"),
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
          name: t("serviceHistory.partNameGearboxOil"),
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
        toast.success(t("serviceHistory.toastUpdated"));
      } else {
        saved = await insertServiceRecord(id as string, payload);
        toast.success(t("serviceHistory.toastSaved"));
      }

      // Upload nota ke Storage setelah record punya id (path memakai recordId).
      // Gagal upload tidak rollback record — user tetap punya data servis.
      if (pendingReceiptFile) {
        try {
          const previousPath = existingReceiptPath;
          const path = await uploadServiceReceipt({
            vehicleId: id as string,
            recordId: saved.id,
            file: pendingReceiptFile,
          });
          await updateServiceRecordReceiptPath(id as string, saved.id, path);
          saved = { ...saved, receipt_path: path };
          if (previousPath && previousPath !== path) {
            try {
              await removeServiceReceipt(previousPath);
            } catch (cleanupErr) {
              console.warn("Failed to remove replaced receipt:", cleanupErr);
            }
          }
        } catch (uploadErr) {
          console.warn("Failed to upload service receipt:", uploadErr);
          toast.warning(
            uploadErr instanceof Error
              ? t("serviceHistory.toastReceiptUploadFailedWithMsg", { msg: uploadErr.message })
              : t("serviceHistory.toastReceiptUploadFailed"),
          );
        }
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
          toast.warning(t("serviceHistory.toastKmUpdateFailed"));
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
            .map(({ reminder }) => {
              const preset = getReminderPreset(reminder.preset_slug);
              return preset ? t(preset.labelKey) : t("nav.reminder");
            })
            .join(", ");
          const description =
            resets.length === 1
              ? t("serviceHistory.toastReminderResetSingle", { labels })
              : t("serviceHistory.toastReminderResetMulti", { n: resets.length, labels });
          toast.success(t("serviceHistory.toastReminderReset"), {
            description,
            // 12s gives the user time to notice & undo without lingering.
            duration: 12_000,
            action: {
              label: t("common.undo"),
              onClick: () => {
                void (async () => {
                  try {
                    await Promise.all(
                      resets.map(({ snapshotId }) => restoreReminderFromReset(snapshotId)),
                    );
                    toast.success(t("serviceHistory.toastUndo"));
                    // Notify other surfaces (reminder page) that data
                    // changed so they refresh from server.
                    window.dispatchEvent(new CustomEvent("mr:vehicle-data-changed"));
                  } catch (undoErr) {
                    toast.error(
                      undoErr instanceof Error
                        ? undoErr.message
                        : t("serviceHistory.toastUndoFailed"),
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
      toast.error(describeAppError(err, t("serviceHistory.toastSaveFailed")));
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
        <IconButton
          label={t("serviceHistory.backToDetail")}
          variant="ghost"
          size="lg"
          onClick={() => router.push(`/vehicles/${id}`)}
          className="mb-4 self-start"
        >
          <BackArrowIcon className="h-5 w-5" />
        </IconButton>

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
                  <h1 className="text-2xl font-extrabold tracking-tight text-(--color-text)">{t("serviceHistory.title")}</h1>
                  <p className="mt-1 text-sm text-(--color-text-secondary)">{t("serviceHistory.subtitle")}</p>
                </div>
                {/* CTA "Tambah servis" hanya muncul kalau sudah ada record —
                    menyamai pattern di Overview page: empty state punya CTA
                    sendiri di tengah, jadi tidak perlu duplikat di header. */}
                {records.length > 0 ? (
                  <AddServiceButton
                    onClick={openAddModal}
                    label={t("serviceHistory.addService")}
                    sublabel={t("serviceHistory.addServiceSub")}
                  />
                ) : null}
              </div>
            </header>

            {records.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-1 py-6 sm:py-10">
                <button
                  type="button"
                  onClick={openAddModal}
                  aria-label={t("serviceHistory.addServiceAria")}
                  className="group flex w-full max-w-[280px] flex-col items-center rounded-[1.75rem] border border-(--color-border) bg-(--color-surface) p-6 pb-7 text-center shadow-sm ring-1 ring-black/[0.03] transition-all hover:border-(--color-primary)/35 hover:shadow-md hover:ring-(--color-primary)/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg) active:scale-[0.98] dark:ring-white/[0.04]"
                >
                  <div className="mb-5 flex h-[7.25rem] w-full max-w-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-(--color-primary)/35 bg-(--color-primary-soft) transition-colors group-hover:border-(--color-primary)/55 group-hover:bg-(--color-primary)/15">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-(--color-primary) text-(--color-bg) shadow-lg shadow-(--color-primary)/35 transition-transform group-hover:scale-105 group-active:scale-95">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-11 w-11"
                        aria-hidden
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </div>
                  </div>
                  <h2 className="text-lg font-bold tracking-tight text-(--color-text)">
                    {t("serviceHistory.emptyTitle")}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-(--color-text-secondary)">
                    {t("serviceHistory.emptySubtitle")}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-primary)">
                    <span className="rounded-lg bg-(--color-primary-soft) px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-(--color-primary)">
                      {t("serviceHistory.emptyCta")}
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <section className="space-y-4">
                <SectionLabel as="h2">{t("serviceHistory.listHeading")}</SectionLabel>
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
                          <IconButton
                            label={t("serviceHistory.editService")}
                            size="md"
                            onClick={() => openEditModal(r)}
                            className="absolute right-2 top-2 z-10"
                          >
                            <PencilEditIcon className="h-5 w-5" />
                          </IconButton>

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
                                <p className="mt-2 text-sm font-semibold tabular-nums text-(--color-text)">
                                  {t("serviceHistory.total", { amount: formatIdr(total) })}
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
                                  {descOpen ? t("serviceHistory.hideDetail") : t("serviceHistory.showDetail")}
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

      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        variant="sheet"
        ariaLabelledBy="add-service-title"
        ariaBusy={saving}
        dismissible={!saving}
        contentClassName="max-h-[80dvh] flex flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--color-border)/60 px-5 py-4">
          <div>
            <h2 id="add-service-title" className="text-lg font-extrabold text-(--color-text)">
              {editingId ? t("serviceHistory.modalEditTitle") : t("serviceHistory.modalAddTitle")}
            </h2>
            {detail ? (
              <p className="mt-0.5 text-xs text-(--color-text-secondary)">{detail.vehicle.name}</p>
            ) : null}
          </div>
          <IconButton
            label={t("common.close")}
            onClick={closeAddModal}
            disabled={saving}
            className="-mr-1 -mt-1"
          >
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              {/* space-y (bukan flex-col) supaya child tidak di-shrink saat scroll. */}
              <div
                ref={modalScrollRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 pb-6"
              >
                <ServiceNotaHero
                  phase={ocrPhase}
                  fileName={pendingReceiptFile?.name ?? null}
                  itemCount={normalizePartLines(partLines).length}
                  detectedDateLabel={
                    ocrDetectedDate ? formatServiceDate(ocrDetectedDate) : null
                  }
                  detectedKmLabel={
                    ocrDetectedKm != null ? `${formatKm(ocrDetectedKm)} km` : null
                  }
                  estimatedTotalLabel={
                    sumParts(normalizePartLines(partLines)) > 0
                      ? formatIdr(sumParts(normalizePartLines(partLines)))
                      : null
                  }
                  errorMessage={ocrError}
                  hasStoredReceipt={!!existingReceiptPath}
                  disabled={saving}
                  onPickFile={(file) => void handleNotaFilePick(file)}
                  onClearFile={clearNotaFile}
                  onRetry={clearNotaFile}
                />

                {/* Manual service info — secondary to AI result */}
                <section className="space-y-3">
                  <SectionLabel as="h3">{t("serviceHistory.serviceInformation")}</SectionLabel>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <SectionLabel>{t("serviceHistory.odometer")}</SectionLabel>
                      {currentKm > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              mileage_at_service: String(currentKm),
                            }))
                          }
                          className="text-[10px] font-bold uppercase tracking-wide text-(--color-primary)"
                        >
                          {t("serviceHistory.setKm", { km: formatKm(currentKm) })}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1.5">
                      <TextInput
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
                          const nav = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
                          if (nav.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
                          if (/^\d$/.test(e.key)) return;
                          e.preventDefault();
                        }}
                        error={kmError !== null && form.mileage_at_service.trim() !== ""}
                        className="text-base font-semibold tabular-nums"
                        placeholder={t("serviceHistory.kmPlaceholder")}
                        trailingSlot={
                          <span className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
                            km
                          </span>
                        }
                      />
                    </div>
                    {kmError && form.mileage_at_service.trim() !== "" ? (
                      <p className="mt-1.5 text-[11px] font-bold text-(--color-text)">{kmError}</p>
                    ) : null}
                  </div>

                  <div>
                    <SectionLabel className="mb-1.5">{t("serviceHistory.date")}</SectionLabel>
                    <TextInput
                      type="date"
                      required
                      value={form.serviced_at}
                      onChange={(e) => setForm({ ...form, serviced_at: e.target.value })}
                    />
                  </div>

                  <div>
                    <SectionLabel className="mb-1.5">{t("serviceHistory.workshopLocation")}</SectionLabel>
                    <TextInput
                      id="modal-location"
                      type="text"
                      autoComplete="off"
                      list="service-location-suggestions"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      maxLength={120}
                      placeholder={t("serviceHistory.locationPlaceholder")}
                      leadingIcon={
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      }
                    />
                    {locationSuggestions.length > 0 ? (
                      <datalist id="service-location-suggestions">
                        {locationSuggestions.map((loc) => (
                          <option key={loc} value={loc} />
                        ))}
                      </datalist>
                    ) : null}
                  </div>

                  <div>
                    <SectionLabel>{t("serviceHistory.serviceType")}</SectionLabel>
                    <div role="radiogroup" aria-label={t("serviceHistory.serviceTypeAria")} className="mt-2 flex flex-wrap gap-2">
                      {quickChips.map((c) => {
                        const isActive = activeChip === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            onClick={() => applyChip(c.id)}
                            className={`rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-all duration-150 ${btnPress} ${
                              isActive
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

                  {/* Compact oil toggles */}
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { which: "engine" as const, flagKey: "changed_engine_oil" as const, label: t("serviceHistory.engineOil"), visible: true },
                        {
                          which: "gearbox" as const,
                          flagKey: "changed_gearbox_oil" as const,
                          label: t("serviceHistory.gearboxOil"),
                          visible: hasGearboxInterval || form.changed_gearbox_oil,
                        },
                      ] as const
                    )
                      .filter((row) => row.visible)
                      .map((row) => {
                        const active = form[row.flagKey];
                        return (
                          <button
                            key={row.which}
                            type="button"
                            onClick={() => toggleOilFlag(row.which, !active)}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 transition-all ${btnPress} ${
                              active
                                ? "bg-(--color-primary-soft) text-(--color-primary) ring-(--color-primary)/40"
                                : "bg-(--color-surface) text-(--color-text-secondary) ring-(--color-border)/40"
                            }`}
                          >
                            {active ? "✓ " : "+ "}
                            {row.label}
                          </button>
                        );
                      })}
                  </div>
                  {(form.changed_engine_oil || form.changed_gearbox_oil) && (
                    <div className="grid grid-cols-2 gap-2">
                      {form.changed_engine_oil ? (
                        <div>
                          <SectionLabel className="mb-1.5">{t("serviceHistory.engineOilPrice")}</SectionLabel>
                          <TextInput
                            ref={oilEnginePriceRef}
                            type="text"
                            inputMode="numeric"
                            value={formatThousandsId(oilPrices.engine, formatNumber)}
                            onChange={(e) =>
                              setOilPrices((p) => ({ ...p, engine: digitsOnly(e.target.value, 12) }))
                            }
                            className="text-right tabular-nums"
                            placeholder="0"
                            leadingIcon={
                              <span className="text-[10px] font-semibold text-(--color-text-muted)">Rp</span>
                            }
                          />
                        </div>
                      ) : null}
                      {form.changed_gearbox_oil ? (
                        <div>
                          <SectionLabel className="mb-1.5">{t("serviceHistory.gearboxOilPrice")}</SectionLabel>
                          <TextInput
                            ref={oilGearboxPriceRef}
                            type="text"
                            inputMode="numeric"
                            value={formatThousandsId(oilPrices.gearbox, formatNumber)}
                            onChange={(e) =>
                              setOilPrices((p) => ({ ...p, gearbox: digitsOnly(e.target.value, 12) }))
                            }
                            className="text-right tabular-nums"
                            placeholder="0"
                            leadingIcon={
                              <span className="text-[10px] font-semibold text-(--color-text-muted)">Rp</span>
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </section>

                {/* Service items — compact cards */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel as="h3">{t("serviceHistory.serviceItems")}</SectionLabel>
                    <span className="text-[11px] font-semibold tabular-nums text-(--color-text-secondary)">
                      {t("serviceHistory.itemsCount", { n: normalizePartLines(partLines).length })}
                    </span>
                  </div>

                  <div className="relative">
                    <label className="sr-only" htmlFor="part-search">{t("serviceHistory.searchPart")}</label>
                    <TextInput
                      id="part-search"
                      type="search"
                      value={partSearch}
                      onChange={(e) => setPartSearch(e.target.value)}
                      placeholder={t("serviceHistory.searchPartPlaceholder")}
                    />
                    {partSearch.trim().length > 0 ? (
                      <ul className="mt-1.5 max-h-40 overflow-y-auto rounded-xl bg-(--color-bg) p-1 shadow-md ring-1 ring-(--color-border)/50">
                        {(() => {
                          // Ekstrak lookup+filter jadi helper lokal supaya
                          // kita bisa cari di locale aktif (t()) tanpa
                          // duplikasi logic — matching by chip_label + display
                          // label yang sudah ter-translate.
                          const q = partSearch.trim().toLowerCase();
                          const matched = partKindsForChips(detail?.motorcycle_category?.slug).filter(
                            (k) =>
                              t(k.chip_label_key).toLowerCase().includes(q) ||
                              t(k.display_label_key).toLowerCase().includes(q),
                          );
                          if (matched.length === 0) {
                            return (
                              <li className="px-3 py-2 text-xs text-(--color-text-muted)">
                                {t("serviceHistory.noMatchingParts")}
                              </li>
                            );
                          }
                          return matched.slice(0, 8).map((kind) => {
                            const used = partLines.some((r) => r.kind_slug === kind.slug);
                            return (
                              <li key={kind.slug}>
                                <button
                                  type="button"
                                  disabled={used}
                                  onClick={() => {
                                    addCommonPart(kind);
                                    setPartSearch("");
                                    setExpandedPartKey(null);
                                  }}
                                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                                    used
                                      ? "cursor-not-allowed text-(--color-text-muted)"
                                      : "text-(--color-text) hover:bg-(--color-primary-soft) hover:text-(--color-primary)"
                                  }`}
                                >
                                  <span aria-hidden>{kind.icon}</span>
                                  {t(kind.chip_label_key)}
                                  {used ? <span className="ml-auto text-[10px]">{t("serviceHistory.added")}</span> : null}
                                </button>
                              </li>
                            );
                          });
                        })()}
                      </ul>
                    ) : null}
                  </div>

                  {partLines.length === 0 ? (
                    // Konsisten dengan inline empty state di condition +
                    // notifications: border/60 + surface/50 + rounded-2xl.
                    <div className="rounded-2xl border border-dashed border-(--color-border)/60 bg-(--color-surface)/50 px-4 py-6 text-center">
                      <p className="text-sm font-semibold text-(--color-text)">{t("serviceHistory.noItemsYet")}</p>
                      <p className="mt-1 text-xs text-(--color-text-secondary)">
                        {t("serviceHistory.noItemsHint")}
                      </p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {partLines.map((line) => {
                        const isRemoving = removingKey === line.key;
                        const expanded = expandedPartKey === line.key;
                        const lineTotal = derivedLineTotal(line.qty, line.unit_price, line.price);
                        const totalNum = parseInt(lineTotal, 10) || 0;
                        return (
                          <li
                            key={line.key}
                            className={`overflow-hidden rounded-xl bg-(--color-surface) ring-1 ring-(--color-border)/40 transition-all duration-200 ${
                              isRemoving ? "max-h-0 opacity-0 ring-0" : "opacity-100"
                            }`}
                          >
                            {!expanded ? (
                              <div className="flex items-center gap-2 px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => setExpandedPartKey(line.key)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="truncate text-sm font-semibold text-(--color-text)">
                                    {line.name.trim() || t("serviceHistory.untitledItem")}
                                  </p>
                                  <p className="mt-0.5 text-[11px] tabular-nums text-(--color-text-secondary)">
                                    Qty {line.qty || "1"}
                                    {totalNum > 0 ? ` · ${formatIdr(totalNum)}` : ""}
                                  </p>
                                </button>
                                <IconButton
                                  label={t("serviceHistory.deleteItem")}
                                  size="sm"
                                  onClick={() => removePart(line.key)}
                                  disabled={isRemoving}
                                  className="shrink-0 text-(--color-text-muted) hover:text-(--color-text)"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                    <path d="M3 6h18M8 6V4h8v2m-9 4v10m10-10v10M10 11v6M14 11v6" strokeLinecap="round" />
                                  </svg>
                                </IconButton>
                              </div>
                            ) : (
                              <div className="space-y-2 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedPartKey(null)}
                                    className="text-[11px] font-bold text-(--color-primary)"
                                  >
                                    {t("serviceHistory.done")}
                                  </button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => removePart(line.key)}
                                  >
                                    {t("common.delete")}
                                  </Button>
                                </div>
                                <TextInput
                                  type="text"
                                  value={line.name}
                                  onChange={(e) =>
                                    setPartLines((rows) =>
                                      rows.map((r) =>
                                        r.key === line.key ? { ...r, name: e.target.value } : r,
                                      ),
                                    )
                                  }
                                  placeholder={t("serviceHistory.description")}
                                  autoFocus
                                />
                                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                                  <div>
                                    <SectionLabel className="mb-1.5">{t("serviceHistory.qty")}</SectionLabel>
                                    <TextInput
                                      type="text"
                                      inputMode="numeric"
                                      value={line.qty}
                                      onChange={(e) => {
                                        const qty = digitsOnly(e.target.value, 6) || "1";
                                        setPartLines((rows) =>
                                          rows.map((r) =>
                                            r.key === line.key
                                              ? {
                                                  ...r,
                                                  qty,
                                                  price: derivedLineTotal(qty, r.unit_price, r.price),
                                                }
                                              : r,
                                          ),
                                        );
                                      }}
                                      className="text-center tabular-nums"
                                    />
                                  </div>
                                  <div>
                                    <SectionLabel className="mb-1.5">{t("serviceHistory.unitPrice")}</SectionLabel>
                                    <TextInput
                                      type="text"
                                      inputMode="numeric"
                                      value={formatThousandsId(line.unit_price, formatNumber)}
                                      onChange={(e) => {
                                        const unit_price = digitsOnly(e.target.value, 12);
                                        setPartLines((rows) =>
                                          rows.map((r) =>
                                            r.key === line.key
                                              ? {
                                                  ...r,
                                                  unit_price,
                                                  price: derivedLineTotal(r.qty, unit_price, r.price),
                                                }
                                              : r,
                                          ),
                                        );
                                      }}
                                      className="text-right tabular-nums"
                                      placeholder="0"
                                      leadingIcon={
                                        <span className="text-[10px] font-semibold text-(--color-text-muted)">Rp</span>
                                      }
                                    />
                                  </div>
                                  <div>
                                    <SectionLabel className="mb-1.5">{t("serviceHistory.fieldTotal")}</SectionLabel>
                                    <p className="rounded-xl bg-(--color-surface-alt) px-2 py-2 text-right text-sm font-bold tabular-nums text-(--color-text-secondary) ring-1 ring-(--color-border)/40">
                                      {totalNum > 0 ? formatIdr(totalNum) : "—"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const fresh = newPartLine();
                      setPartLines((rows) => [...rows, fresh]);
                      setExpandedPartKey(fresh.key);
                    }}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-(--color-border) bg-(--color-surface)/40 px-4 py-3 text-xs font-bold text-(--color-text-secondary) hover:border-(--color-primary)/40 hover:text-(--color-primary) ${btnPress}`}
                  >
                    {t("serviceHistory.addManualItem")}
                  </button>

                  <div>
                    <SectionLabel className="mb-1.5">{t("serviceHistory.notes")}</SectionLabel>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={2}
                      className={textareaClass}
                      placeholder={t("serviceHistory.notesPlaceholder")}
                    />
                  </div>
                </section>
              </div>

              <div className="shrink-0 border-t border-(--color-border)/50 bg-(--color-bg) px-4 pt-3 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))]">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <SectionLabel>{t("serviceHistory.summary")}</SectionLabel>
                    <p className="mt-0.5 text-xs font-semibold text-(--color-text-secondary)">
                      {t("serviceHistory.itemsDetected", { n: normalizePartLines(partLines).length })}
                    </p>
                  </div>
                  <p className="text-base font-extrabold tabular-nums text-(--color-primary)">
                    {formatIdr(
                      sumParts(normalizePartLines(partLines)) +
                        (form.changed_engine_oil
                          ? parseInt(digitsOnly(oilPrices.engine, 12), 10) || 0
                          : 0) +
                        (form.changed_gearbox_oil
                          ? parseInt(digitsOnly(oilPrices.gearbox, 12), 10) || 0
                          : 0),
                    )}
                  </p>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={saving}
                  disabled={saveDisabled || ocrPhase === "processing"}
                >
                  {saving
                    ? t("vehicles.submitting")
                    : editingId
                      ? t("vehicles.submitSave")
                      : t("serviceHistory.saveService")}
                </Button>
              </div>
            </form>
      </Modal>

      <Modal
        open={!!selectedRecord}
        onClose={closeDetailSheet}
        variant="sheet"
        ariaLabelledBy="service-detail-title"
        contentClassName="max-h-[80dvh] flex flex-col overflow-hidden border border-(--color-border) p-0"
      >
        {selectedRecord ? (
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            transform: `translateY(${detailDragY}px)`,
            transition: detailDragging ? "none" : "transform 200ms ease-out",
          }}
        >
            {/* Handle + header: area drag untuk slide-down dismiss (mobile). */}
            <div
              className="shrink-0 touch-none border-b border-(--color-border)/60 pt-2 sm:pt-0"
              onPointerDown={onDetailDragPointerDown}
              onPointerMove={onDetailDragPointerMove}
              onPointerUp={onDetailDragPointerUp}
              onPointerCancel={onDetailDragPointerUp}
            >
              <div className="flex justify-center pb-1 sm:hidden" aria-hidden>
                <div className="h-1 w-10 rounded-full bg-(--color-border)" />
              </div>
              <div className="flex items-start justify-between gap-3 px-5 py-3 sm:py-4">
                <h3 id="service-detail-title" className="text-lg font-extrabold text-(--color-text)">
                  {t("serviceHistory.detailTitle")}
                </h3>
                <div className="flex shrink-0 items-center gap-1.5">
                  <IconButton
                    label={t("serviceHistory.editHistoryAria")}
                    variant="solid"
                    onClick={() => {
                      const r = selectedRecord;
                      closeDetailSheet();
                      openEditModal(r);
                    }}
                    className="bg-(--color-primary-soft) text-(--color-primary) hover:brightness-95"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      // `h-4.5 w-4.5` INVALID di Tailwind v4 default scale
                      // (increment 0.5 hanya sampai 3.5). Pakai arbitrary
                      // value `[1.125rem]` = 18px setara maksud awal.
                      className="h-[1.125rem] w-[1.125rem]"
                      aria-hidden
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </IconButton>
                  <IconButton
                    label={t("serviceHistory.deleteHistoryAria")}
                    onClick={() => requestDeleteRecord(selectedRecord)}
                    // Grayscale destructive icon button — hover ramps up
                    // pakai text-inverted bg untuk "loud" affordance sebelum
                    // ConfirmDialog muncul.
                    className="bg-(--color-surface-alt) text-(--color-text-secondary) hover:bg-(--color-text) hover:text-(--color-bg)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      // Same fix as edit-icon above — `h-4.5` invalid, pakai
                      // arbitrary 18px untuk consistency.
                      className="h-[1.125rem] w-[1.125rem]"
                      aria-hidden
                    >
                      <path d="M3 6h18M8 6V4h8v2m-9 4v10m10-10v10M10 11v6M14 11v6" />
                    </svg>
                  </IconButton>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
              {/* Meta servis — grid 2 kolom; field panjang full-width. */}
              <section className="overflow-hidden rounded-2xl bg-(--color-surface) ring-1 ring-(--color-border)/45">
                <dl className="grid grid-cols-2 gap-px bg-(--color-border)/40">
                  <div className="bg-(--color-surface) px-3.5 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--color-text-muted)">
                      {t("serviceHistory.fieldDate")}
                    </dt>
                    <dd className="mt-1 text-[13px] font-semibold tracking-tight text-(--color-text)">
                      {formatServiceDate(selectedRecord.serviced_at)}
                    </dd>
                  </div>
                  <div className="bg-(--color-surface) px-3.5 py-3">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--color-text-muted)">
                      {t("serviceHistory.fieldKm")}
                    </dt>
                    <dd className="mt-1 font-mono text-[13px] font-semibold tracking-tight text-(--color-text) tabular-nums">
                      {formatKm(selectedRecord.mileage_at_service)}
                    </dd>
                  </div>
                  <div
                    className={`bg-(--color-surface) px-3.5 py-3 ${
                      oilChangeLabel(selectedRecord) ? "" : "col-span-2"
                    }`}
                  >
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--color-text-muted)">
                      {t("serviceHistory.fieldType")}
                    </dt>
                    <dd className="mt-1 text-[13px] font-semibold tracking-tight text-(--color-text)">
                      {recordTitle(selectedRecord)}
                    </dd>
                  </div>
                  {oilChangeLabel(selectedRecord) ? (
                    <div className="bg-(--color-surface) px-3.5 py-3">
                      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--color-text-muted)">
                        {t("serviceHistory.fieldOilChange")}
                      </dt>
                      <dd className="mt-1.5">
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-(--color-text)/25 bg-(--color-surface-alt) px-2.5 py-1 text-[11px] font-bold text-(--color-text)">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                            <path d="M12 2v6M5 8a7 7 0 0 0 14 0M12 8v14" />
                          </svg>
                          <span className="truncate">{oilChangeLabel(selectedRecord)}</span>
                        </span>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {selectedRecord.location?.trim() ? (
                  <div className="border-t border-(--color-border)/40 px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--color-text-muted)">
                      {t("serviceHistory.fieldLocation")}
                    </p>
                    <p className="mt-1 inline-flex items-start gap-1.5 break-words text-[13px] font-semibold tracking-tight text-(--color-text)">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-(--color-text-muted)" aria-hidden>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>{selectedRecord.location}</span>
                    </p>
                  </div>
                ) : null}

                {selectedRecord.description?.trim() ? (
                  <div className="border-t border-(--color-border)/40 px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--color-text-muted)">
                      {t("serviceHistory.fieldNotes")}
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-relaxed tracking-tight text-(--color-text-secondary)">
                      {selectedRecord.description}
                    </p>
                  </div>
                ) : null}

                {selectedRecord.receipt_path ? (
                  <div className="flex items-center justify-between gap-3 border-t border-(--color-border)/40 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-(--color-text-muted)">
                        {t("serviceHistory.receiptTitle")}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] font-medium text-(--color-text-secondary)">
                        {t("serviceHistory.receiptSaved")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // Mobile (iOS Safari/Chrome) memblokir window.open setelah await.
                        // Buka tab kosong dulu secara sync di dalam gesture user.
                        const preview = window.open("about:blank", "_blank");
                        void (async () => {
                          try {
                            const url = await createServiceReceiptSignedUrl(
                              selectedRecord.receipt_path!,
                            );
                            if (preview) {
                              preview.opener = null;
                              preview.location.href = url;
                            } else {
                              window.location.assign(url);
                            }
                          } catch (err) {
                            preview?.close();
                            toast.error(
                              describeAppError(err, t("serviceHistory.ocrReadFailed")),
                            );
                          }
                        })();
                      }}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-(--color-primary-soft) px-3 py-2 text-xs font-bold text-(--color-primary) hover:brightness-95 ${btnPress}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4"
                        aria-hidden
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      {t("serviceHistory.invoice")}
                    </button>
                  </div>
                ) : null}
              </section>

              {/* Part & biaya — section terpisah dari meta. */}
              {selectedRecord.parts.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-(--color-text-muted)">
                    {t("serviceHistory.partsAndCost")}
                  </h4>
                  <div className="overflow-hidden rounded-2xl bg-(--color-surface) ring-1 ring-(--color-border)/45">
                    <ul className="divide-y divide-(--color-border)/45">
                      {selectedRecord.parts.map((p, i) => {
                        const qty = p.qty != null && p.qty > 0 ? p.qty : null;
                        const unit =
                          p.unit_price != null && p.unit_price > 0
                            ? p.unit_price
                            : null;
                        const showBreakdown =
                          qty != null && unit != null && (qty !== 1 || unit !== p.price);
                        return (
                          <li
                            key={`${p.name}-${i}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 px-3.5 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold tracking-tight text-(--color-text)">
                                {p.name}
                              </p>
                              {showBreakdown ? (
                                <p className="mt-0.5 font-mono text-[11px] font-medium tracking-tight text-(--color-text-secondary) tabular-nums">
                                  {qty}
                                  <span className="mx-1 text-(--color-text-muted)">×</span>
                                  {formatIdr(unit)}
                                </p>
                              ) : null}
                            </div>
                            <p className="shrink-0 text-right font-mono text-[13px] font-semibold tracking-tight text-(--color-text) tabular-nums">
                              {formatIdr(p.price)}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex items-baseline justify-between gap-4 border-t border-(--color-border)/55 bg-(--color-surface-alt)/80 px-3.5 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-(--color-text-secondary)">
                        {t("serviceHistory.fieldTotal")}
                      </span>
                      <span className="text-right font-mono text-[15px] font-bold tracking-tight text-(--color-primary) tabular-nums">
                        {formatIdr(sumParts(selectedRecord.parts))}
                      </span>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-(--color-border)/60 px-5 py-4 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:pb-4">
              <Button variant="secondary" size="lg" fullWidth onClick={closeDetailSheet}>
                {t("common.close")}
              </Button>
            </div>
        </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!pendingDeleteRecord}
        title={t("serviceHistory.deleteTitle")}
        message={
          pendingDeleteRecord
            ? t("serviceHistory.deleteMessage", {
                date: formatServiceDate(pendingDeleteRecord.serviced_at),
                km: formatKm(pendingDeleteRecord.mileage_at_service),
              })
            : ""
        }
        confirmLabel={deletingRecord ? t("serviceHistory.deleting") : t("common.delete")}
        cancelLabel={t("common.cancel")}
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
