/**
 * Normalize odometer reading from Gemini.
 * Honda-style display: 39815.6 → 39815 km (digit after decimal = meter, ignored).
 */
export function normalizeOdometerKm(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n > 0 && n <= 9_999_999 ? n : null;
  }

  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Decimal present: integer part is km; fractional part is meters — drop it.
  if (/^\d+\.\d+$/.test(trimmed)) {
    const integerPart = trimmed.split(".")[0];
    const n = parseInt(integerPart, 10);
    return Number.isFinite(n) && n > 0 && n <= 9_999_999 ? n : null;
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;

  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 && n <= 9_999_999 ? n : null;
}

export type OdometerConfidence = "high" | "medium" | "low";

export type OdometerScanResult = {
  km: number;
  confidence: OdometerConfidence;
};

export function parseOdometerConfidence(raw: unknown): OdometerConfidence {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

export function parseOdometerJson(text: string): OdometerScanResult | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { km?: unknown; confidence?: unknown };
    const km = normalizeOdometerKm(parsed.km);
    if (km == null) return null;
    return { km, confidence: parseOdometerConfidence(parsed.confidence) };
  } catch {
    return null;
  }
}
