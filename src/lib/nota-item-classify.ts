/**
 * Klasifikasi baris nota → oli mesin / oli gardan / PART_KINDS slug / other.
 *
 * Urutan:
 * 1. Safety rules (oil seal ≠ oli)
 * 2. Keyword kuat (10W-30, busi, v-belt, …)
 * 3. Usulan Gemini (`kind`) jika valid
 * 4. Fallback `other`
 */

import { PART_KIND_BY_SLUG, type PartKind } from "@/lib/part-kinds";

/** Kind yang dikenali sistem (termasuk oli yang TIDAK ada di PART_KINDS). */
export type NotaItemKind =
  | "engine_oil"
  | "gearbox_oil"
  | "labor"
  | "other"
  | PartKind["slug"];

const PART_SLUGS = new Set(Object.keys(PART_KIND_BY_SLUG));

const VALID_KINDS = new Set<string>([
  "engine_oil",
  "gearbox_oil",
  "labor",
  "other",
  ...PART_SLUGS,
]);

/** Viscosity grade — sinyal kuat oli pelumas (bukan seal). */
const VISCOSITY_RE = /\b\d{1,2}\s*w\s*-?\s*\d{2}\b/i;

/** Volume liter tipikal ganti oli. */
const OIL_VOLUME_RE = /\b\d+([.,]\d+)?\s*l(iter)?\b/i;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_/\\|+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

/** True jika teks jelas seal/gasket — JANGAN map ke engine_oil. */
export function isOilSealNotLubricant(name: string): boolean {
  const n = norm(name);
  return (
    hasAny(n, [
      "oil seal",
      "oilseal",
      "seal oli",
      "sealoli",
      "simmering",
      "simering",
      "oring",
      "o-ring",
      "o ring",
      "gasket",
      "packing",
    ]) ||
    // Ukuran seal tipikal: 20.8X52X7.5
    /\b\d+([.,]\d+)?\s*[x×]\s*\d+([.,]\d+)?\s*[x×]\s*\d+([.,]\d+)?\b/i.test(n)
  );
}

/**
 * Keyword classifier — dipakai sebagai override/safety atas Gemini
 * dan fallback jika Gemini tidak mengirim kind.
 */
export function classifyNotaItemByKeywords(name: string): NotaItemKind | null {
  const n = norm(name);
  if (!n) return null;

  // 1) Anti false-positive oli
  if (isOilSealNotLubricant(name)) {
    return "other";
  }

  // 2) Filter oli (sebelum generic "oli")
  if (hasAny(n, ["filter oli", "oil filter", "saringan oli"])) {
    return "oil_filter";
  }

  // 3) Oli gardan / gearbox / CVT fluid
  if (
    hasAny(n, [
      "oli gardan",
      "oli gearbox",
      "gear oil",
      "gearbox oil",
      "gardan",
      "final gear",
      "cvt fluid",
      "oli cvt",
      "atf",
    ])
  ) {
    return "gearbox_oil";
  }

  // 4) Oli mesin — viscosity / merek / frase eksplisit
  if (
    VISCOSITY_RE.test(n) ||
    OIL_VOLUME_RE.test(n) ||
    hasAny(n, [
      "oli mesin",
      "engine oil",
      "motor oil",
      "yamalube",
      "motul",
      "shell advance",
      "repsol",
      "castrol",
      "federal",
      "ahmpp",
      "honda oil",
      "mpx",
      "spx",
    ])
  ) {
    // SPX/MPX sering kode oli Honda — tapi skip jika jelas bukan oli
    if (hasAny(n, ["spx", "mpx"]) && !VISCOSITY_RE.test(n) && !OIL_VOLUME_RE.test(n)) {
      // kode saja tanpa grade/volume → biarkan Gemini/other
    } else {
      return "engine_oil";
    }
  }
  if (hasAny(n, ["oli "]) && !hasAny(n, ["seal", "filter", "saringan"])) {
    // "oli ..." generik → default mesin (bukan gardan sudah tertangkap di atas)
    return "engine_oil";
  }

  // 5) Part katalog
  if (hasAny(n, ["busi", "spark plug", "ngk", "denso iridium", "iridium"])) {
    return "spark_plug";
  }
  if (hasAny(n, ["kampas rem", "brake pad", "disc pad", "brake shoe", "kampas cakram"])) {
    return "brake_pad";
  }
  if (hasAny(n, ["filter udara", "air filter", "saringan udara"])) {
    return "air_filter";
  }
  if (hasAny(n, ["v-belt", "v belt", "vbelt", "drive belt", "van belt", "fan belt"])) {
    return "v_belt";
  }
  if (hasAny(n, ["roller", "weight roller"])) {
    return "roller_cvt";
  }
  if (hasAny(n, ["kampas ganda", "clutch facing"])) {
    return "kampas_ganda";
  }
  if (hasAny(n, ["rantai", "chain", "gear set", "gir set", "sprocket"])) {
    return "chain_set";
  }
  if (hasAny(n, ["kampas kopling", "clutch disc", "clutch plate"])) {
    return "kampas_kopling";
  }
  if (hasAny(n, ["aki", "battery", "accu", "yuasa", "gs astra"])) {
    return "battery";
  }
  if (hasAny(n, ["ban ", "ban+", "tire", "tyre", "fdr ", "mizzle", "irc "])) {
    return "tire";
  }
  if (hasAny(n, ["lampu", "bulb", "headlamp", "stoplamp", "sein"])) {
    return "lamp";
  }

  // 6) Jasa
  if (
    hasAny(n, ["jasa", "upah", "ongkos", "biaya jasa", "jasa ganti", "jasa pasang", "jasa servis", "jasa service"])
  ) {
    return "labor";
  }

  return null;
}

/** Normalisasi usulan Gemini ke kind valid. */
export function normalizeGeminiItemKind(raw: unknown): NotaItemKind | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!k || k === "null" || k === "unknown") return null;
  // Alias umum
  const aliases: Record<string, NotaItemKind> = {
    oil: "engine_oil",
    oli: "engine_oil",
    oli_mesin: "engine_oil",
    engineoil: "engine_oil",
    oli_gardan: "gearbox_oil",
    oli_gearbox: "gearbox_oil",
    gear_oil: "gearbox_oil",
    cvt_oil: "gearbox_oil",
    cvt_fluid: "gearbox_oil",
    busi: "spark_plug",
    sparkplug: "spark_plug",
    brake: "brake_pad",
    brakepad: "brake_pad",
    vbelt: "v_belt",
    belt: "v_belt",
    airfilter: "air_filter",
    oilfilter: "oil_filter",
    jasa: "labor",
    service: "labor",
  };
  const mapped = aliases[k] ?? (VALID_KINDS.has(k) ? (k as NotaItemKind) : null);
  return mapped;
}

/**
 * Resolve kind final: keyword safety/strong signal dulu, lalu Gemini, lalu other.
 * Hanya dipanggil untuk baris Part — jangan dipakai untuk Jasa.
 */
export function resolveNotaItemKind(name: string, geminiKind?: string | null): NotaItemKind {
  // Oil seal selalu other (override Gemini yang mungkin salah)
  if (isOilSealNotLubricant(name)) return "other";

  const byKeyword = classifyNotaItemByKeywords(name);
  // Keyword kuat untuk oli/part → pakai keyword (lebih aman dari Gemini salah)
  if (
    byKeyword &&
    byKeyword !== "other" &&
    byKeyword !== "labor"
  ) {
    return byKeyword;
  }

  const byGemini = normalizeGeminiItemKind(geminiKind);
  if (byGemini && byGemini !== "labor") {
    return byGemini;
  }

  if (byKeyword && byKeyword !== "labor") return byKeyword;
  return "other";
}

/**
 * Apakah baris ini jasa? Mapping oli/kind_slug di-skip; baris tetap masuk form
 * supaya total harga = nota.
 */
export function isLaborLine(
  name: string,
  lineType?: string | null,
  geminiKind?: string | null,
): boolean {
  if (lineType === "labor") return true;
  if (normalizeGeminiItemKind(geminiKind) === "labor") return true;
  return classifyNotaItemByKeywords(name) === "labor";
}

export type MappedNotaFormParts = {
  /** Free-form / katalog part (bukan oli flag). */
  partLines: Array<{
    name: string;
    qty: string;
    unit_price: string;
    price: string;
    kind_slug: string | null;
  }>;
  changed_engine_oil: boolean;
  changed_gearbox_oil: boolean;
  oilPrices: { engine: string; gearbox: string };
};

type ClassifiableItem = {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  line_type?: "part" | "labor" | null;
  kind?: string | null;
};

function pushFreeLine(
  partLines: MappedNotaFormParts["partLines"],
  item: ClassifiableItem,
  lineTotal: number,
  unit: number,
  kind_slug: string | null = null,
) {
  partLines.push({
    name: item.name,
    qty: String(Math.max(1, item.qty)),
    unit_price: unit > 0 ? String(unit) : "",
    price: lineTotal > 0 ? String(lineTotal) : "",
    kind_slug,
  });
}

/**
 * Map hasil OCR ke state form servis.
 * - Jasa (labor): tetap masuk partLines (harga), tanpa mapping oli/kind.
 * - Part: oli → flag + oilPrices; katalog → kind_slug; sisanya free-text.
 */
export function mapNotaItemsToFormParts(items: ClassifiableItem[]): MappedNotaFormParts {
  const partLines: MappedNotaFormParts["partLines"] = [];
  let changed_engine_oil = false;
  let changed_gearbox_oil = false;
  let enginePrice = 0;
  let gearboxPrice = 0;

  for (const item of items) {
    const lineTotal = item.total > 0 ? item.total : item.unit_price * Math.max(1, item.qty);
    const unit = item.unit_price > 0 ? item.unit_price : lineTotal;

    // Jasa: simpan baris untuk total nota, jangan map ke oli / kind_slug.
    if (isLaborLine(item.name, item.line_type, item.kind)) {
      pushFreeLine(partLines, item, lineTotal, unit, null);
      continue;
    }

    const kind = resolveNotaItemKind(item.name, item.kind);

    if (kind === "engine_oil") {
      changed_engine_oil = true;
      enginePrice += lineTotal;
      continue;
    }
    if (kind === "gearbox_oil") {
      changed_gearbox_oil = true;
      gearboxPrice += lineTotal;
      continue;
    }

    const kind_slug =
      kind !== "other" && kind !== "labor" && PART_SLUGS.has(kind) ? kind : null;

    pushFreeLine(partLines, item, lineTotal, unit, kind_slug);
  }

  return {
    partLines,
    changed_engine_oil,
    changed_gearbox_oil,
    oilPrices: {
      engine: enginePrice > 0 ? String(enginePrice) : "",
      gearbox: gearboxPrice > 0 ? String(gearboxPrice) : "",
    },
  };
}
