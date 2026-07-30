/**
 * Parse & normalize Gemini OCR output for workshop "nota penjualan".
 * Handles Indonesian Rupiah formats: "Rp 65.000", "65000", "65.000,00".
 */

/** Part vs jasa di nota bengkel. Mapping kind hanya untuk `part`. */
export type NotaLineType = "part" | "labor";

export type NotaScanItem = {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  /**
   * Part vs jasa. Jasa tetap di items (untuk total harga),
   * tapi tidak di-map ke oli / kind_slug.
   */
  line_type: NotaLineType;
  /**
   * Usulan jenis part dari Gemini (opsional; relevan jika line_type=part).
   * App tetap resolve lewat `nota-item-classify`.
   */
  kind?: string | null;
};

export type NotaScanResult = {
  workshop: string | null;
  serviced_at: string | null;
  /** KM odometer dari nota (jika terbaca). */
  odometer_km: number | null;
  items: NotaScanItem[];
};

function stripMoneyNoise(raw: string): string {
  return raw
    .replace(/rp\.?/gi, "")
    .replace(/\s/g, "")
    .replace(/idr/gi, "")
    .trim();
}

/** Parse Rupiah-ish string/number into integer rupiah (no decimals). */
export function parseRupiahAmount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (typeof raw !== "string") return null;
  let s = stripMoneyNoise(raw);
  if (!s) return null;

  // "65.000,00" or "65000,50" → drop decimal part
  if (s.includes(",")) {
    s = s.split(",")[0] ?? s;
  }
  // Indonesian thousands: dots as separators → remove
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else {
    s = s.replace(/[^\d]/g, "");
  }

  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseQty(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.round(raw));
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(",", ".");
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.round(n));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseServicedAt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(s)) return null;
  const d = new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

/**
 * Parse KM dari nota. Bedakan pemisah ribuan ID ("39.888" → 39888)
 * vs desimal meter odometer ("39815.6" → 39815).
 */
export function parseNotaOdometerKm(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    return n > 0 && n <= 9_999_999 ? n : null;
  }
  if (typeof raw !== "string") return null;
  let s = raw
    .trim()
    .replace(/km\.?/gi, "")
    .replace(/kilometer/gi, "")
    .replace(/\s/g, "");
  if (!s) return null;

  // "39.888" / "1.234.567" → ribuan Indonesia
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // "39815.6" → bagian sebelum titik = km
    s = s.split(".")[0] ?? s;
  } else {
    s = s.replace(/[^\d]/g, "");
  }

  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 9_999_999) return null;
  return n;
}

function normalizeItem(raw: unknown): NotaScanItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;

  const qty = parseQty(o.qty) ?? 1;
  let unit_price = parseRupiahAmount(o.unit_price);
  let total = parseRupiahAmount(o.total);

  if (unit_price == null && total != null && qty > 0) {
    unit_price = Math.round(total / qty);
  }
  if (total == null && unit_price != null) {
    total = unit_price * qty;
  }
  if (unit_price == null) unit_price = 0;
  if (total == null) total = unit_price * qty;

  // Prefer qty × unit when both present and total looks off by rounding
  if (unit_price > 0 && qty > 0) {
    const derived = unit_price * qty;
    if (total === 0 || Math.abs(total - derived) / Math.max(derived, 1) > 0.05) {
      total = derived;
    }
  }

  const line_type = parseNotaLineType(
    o.line_type ?? o.item_type ?? o.lineType ?? o.type,
  );

  // Jangan pakai `type` untuk kind — field itu dipakai line_type (part|labor).
  const kindRaw = o.kind ?? o.category ?? o.part_kind;
  const kind =
    typeof kindRaw === "string" && kindRaw.trim().length > 0
      ? kindRaw.trim()
      : null;

  return { name, qty, unit_price, total, line_type, kind };
}

/** Normalize part vs jasa. Default `part` jika model tidak mengirim. */
export function parseNotaLineType(raw: unknown): NotaLineType {
  if (typeof raw !== "string") return "part";
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    s === "labor" ||
    s === "jasa" ||
    s === "service" ||
    s === "jasa_servis" ||
    s === "upah" ||
    s === "ongkos"
  ) {
    return "labor";
  }
  if (s === "part" || s === "sparepart" || s === "barang" || s === "parts") {
    return "part";
  }
  return "part";
}

/** Extract JSON object from model text (handles accidental markdown fences). */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* try fence / substring */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export function parseNotaScanJson(text: string): NotaScanResult | null {
  const root = extractJsonObject(text);
  if (!root || typeof root !== "object") return null;
  const o = root as Record<string, unknown>;

  const workshop =
    typeof o.workshop === "string" && o.workshop.trim().length > 0
      ? o.workshop.trim()
      : null;
  const serviced_at = parseServicedAt(o.serviced_at);
  const odometer_km =
    parseNotaOdometerKm(o.odometer_km) ??
    parseNotaOdometerKm(o.km) ??
    parseNotaOdometerKm(o.mileage);

  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items: NotaScanItem[] = [];
  for (const item of itemsRaw) {
    const n = normalizeItem(item);
    if (n) items.push(n);
  }

  if (items.length === 0 && !workshop && !serviced_at && odometer_km == null) return null;
  return { workshop, serviced_at, odometer_km, items };
}
