/**
 * Catalog of "part kinds" — definisi part standar yang sistem kenal.
 *
 * Tujuan utama:
 *   1. Sumber data untuk chip "Tambah cepat" pada modal Tambah/Ubah servis.
 *      Saat user tap chip, slug-nya disimpan di `ServicePartLine.kind_slug`
 *      pada JSONB `service_records.parts` — sehingga lifetime tiap part bisa
 *      di-derive (lihat `lib/part-condition-utils.ts`).
 *   2. Sumber data untuk halaman "Kondisi Part" (`/vehicles/[id]/condition`):
 *      kind dengan `interval_km` atau `interval_months` non-null akan tampil
 *      sebagai card lifetime untuk kendaraan yang kategorinya cocok.
 *
 * Catatan desain:
 *   - Oli mesin & oli gardan TIDAK didefinisikan di sini. Keduanya sudah punya
 *     mekanisme tracking sendiri (flag `changed_engine_oil` / `changed_gearbox_oil`
 *     pada service record + interval dari `motorcycle_categories`). Halaman
 *     Kondisi Part akan menggabung keduanya secara terpisah lewat
 *     `oil-utils.ts` supaya perilakunya tidak duplikat.
 *   - Interval di sini adalah DEFAULT konservatif berdasarkan service guide
 *     umum motor Indonesia (Honda/Yamaha). User boleh override per-vehicle
 *     nanti (rencana fase 3 — lihat diskusi). Edit angka di sini ekspos cepat
 *     tanpa migration.
 *   - `applies_to_categories: []` artinya berlaku untuk semua kategori motor.
 */

export type PartKind = {
  /** ID stabil yang disimpan di JSONB. JANGAN ubah setelah ada user data. */
  slug: string;
  /** Label di chip "Tambah cepat" (lebih ringkas). */
  chip_label: string;
  /** Label di card halaman Kondisi Part (boleh lebih panjang). */
  display_label: string;
  /** Emoji untuk visual ringan di card kondisi. */
  icon: string;
  /** Interval km. Null = tidak relevan dengan km (mis. aki). */
  interval_km: number | null;
  /** Interval bulan. Null = murni km-based. */
  interval_months: number | null;
  /**
   * Slug kategori motor yang berlaku ('matic' | 'bebek' | 'sport').
   * Empty array = semua kategori.
   */
  applies_to_categories: string[];
  /**
   * Apakah ditampilkan di halaman Kondisi Part. Beberapa part (lampu, dll)
   * tidak punya interval baku — biarkan jadi chip saja, jangan bikin card.
   */
  show_in_condition: boolean;
  /** Urutan tampilan di chip & card. Lebih kecil = lebih atas/awal. */
  sort_order: number;
};

export const PART_KINDS: PartKind[] = [
  {
    slug: "spark_plug",
    chip_label: "Busi",
    display_label: "Busi",
    icon: "⚡",
    interval_km: 8000,
    interval_months: null,
    applies_to_categories: [],
    show_in_condition: true,
    sort_order: 10,
  },
  {
    slug: "brake_pad",
    chip_label: "Kampas rem",
    display_label: "Kampas rem",
    icon: "🛑",
    interval_km: 15000,
    interval_months: null,
    applies_to_categories: [],
    show_in_condition: true,
    sort_order: 15,
  },
  {
    slug: "air_filter",
    chip_label: "Filter udara",
    display_label: "Filter udara",
    icon: "💨",
    interval_km: 10000,
    interval_months: 12,
    applies_to_categories: [],
    show_in_condition: true,
    sort_order: 20,
  },
  {
    slug: "oil_filter",
    chip_label: "Filter oli",
    display_label: "Filter oli",
    icon: "🧴",
    interval_km: 5000,
    interval_months: null,
    applies_to_categories: [],
    show_in_condition: true,
    sort_order: 25,
  },
  {
    slug: "roller_cvt",
    chip_label: "Roller CVT",
    display_label: "Roller CVT",
    icon: "⚙️",
    interval_km: 25000,
    interval_months: null,
    applies_to_categories: ["matic"],
    show_in_condition: true,
    sort_order: 30,
  },
  {
    slug: "v_belt",
    chip_label: "V-belt",
    display_label: "V-belt CVT",
    icon: "🔗",
    interval_km: 25000,
    interval_months: null,
    applies_to_categories: ["matic"],
    show_in_condition: true,
    sort_order: 31,
  },
  {
    slug: "kampas_ganda",
    chip_label: "Kampas ganda",
    display_label: "Kampas ganda",
    icon: "🌀",
    interval_km: 24000,
    interval_months: null,
    applies_to_categories: ["matic"],
    show_in_condition: true,
    sort_order: 32,
  },
  {
    slug: "chain_set",
    chip_label: "Rantai & gear",
    display_label: "Rantai & gear",
    icon: "🔗",
    interval_km: 20000,
    interval_months: null,
    applies_to_categories: ["bebek", "sport"],
    show_in_condition: true,
    sort_order: 33,
  },
  {
    slug: "kampas_kopling",
    chip_label: "Kampas kopling",
    display_label: "Kampas kopling",
    icon: "🔧",
    interval_km: 20000,
    interval_months: null,
    applies_to_categories: ["bebek", "sport"],
    show_in_condition: true,
    sort_order: 34,
  },
  {
    slug: "battery",
    chip_label: "Aki",
    display_label: "Aki",
    icon: "🔋",
    interval_km: null,
    interval_months: 24,
    applies_to_categories: [],
    show_in_condition: true,
    sort_order: 50,
  },
  {
    slug: "tire",
    chip_label: "Ban",
    display_label: "Ban",
    icon: "🛞",
    interval_km: 20000,
    interval_months: 36,
    applies_to_categories: [],
    show_in_condition: true,
    sort_order: 60,
  },
  {
    slug: "lamp",
    chip_label: "Lampu",
    display_label: "Lampu",
    icon: "💡",
    interval_km: null,
    interval_months: null,
    applies_to_categories: [],
    show_in_condition: false,
    sort_order: 70,
  },
];

/** Lookup cepat by slug — pakai ini untuk resolve dari JSONB ke metadata. */
export const PART_KIND_BY_SLUG: Record<string, PartKind> = Object.fromEntries(
  PART_KINDS.map((k) => [k.slug, k]),
);

/**
 * Daftar part kind yang berlaku untuk kategori motor tertentu.
 * Untuk dipakai oleh chip "Tambah cepat" di modal Tambah/Ubah servis.
 *
 * @param categorySlug 'matic' | 'bebek' | 'sport' | null. Null/unknown =
 *   tampilkan part universal saja (yang `applies_to_categories: []`).
 */
export function partKindsForChips(categorySlug: string | null | undefined): PartKind[] {
  return PART_KINDS.filter(
    (k) =>
      k.applies_to_categories.length === 0 ||
      (categorySlug != null && k.applies_to_categories.includes(categorySlug)),
  ).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Daftar part kind yang ditampilkan di halaman Kondisi Part untuk kategori
 * tertentu. Hanya yang punya interval (km / months) dan `show_in_condition`.
 *
 * Catatan: oli mesin & oli gardan TIDAK termasuk di sini — di-handle
 * terpisah oleh halaman Kondisi Part (lihat oil-utils.ts).
 */
export function partKindsForCondition(categorySlug: string | null | undefined): PartKind[] {
  return PART_KINDS.filter((k) => {
    if (!k.show_in_condition) return false;
    if (k.interval_km == null && k.interval_months == null) return false;
    if (
      k.applies_to_categories.length > 0 &&
      (categorySlug == null || !k.applies_to_categories.includes(categorySlug))
    ) {
      return false;
    }
    return true;
  }).sort((a, b) => a.sort_order - b.sort_order);
}
