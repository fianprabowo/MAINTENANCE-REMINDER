import { cropCanvas, canvasToJpegBase64, type CropRect } from "./odometer-image";
import type { OdometerScanResult } from "./odometer-normalize";
import { parseOdometerConfidence } from "./odometer-normalize";

export type ScanProgress = "validating" | "scanning" | "processing";

/**
 * Stable error codes untuk odometer-scan failures. UI (mis. modal scan)
 * catch `OdometerScanError` lalu translate via `t(\`odometerScanError.${code}\`)`.
 * Kenapa class terpisah, bukan pakai `err.message`? Karena `err.message`
 * dari server bisa jadi Indonesian debug string (mis. GEMINI config error)
 * yang janggal muncul di UI English.
 */
export type OdometerScanErrorCode = "server_error" | "invalid_response";

export class OdometerScanError extends Error {
  readonly code: OdometerScanErrorCode;
  /** Raw upstream message untuk logging — jangan render ke user. */
  readonly upstream: string | null;

  constructor(code: OdometerScanErrorCode, upstream: string | null = null) {
    super(`odometer scan failed: ${code}${upstream ? ` (${upstream})` : ""}`);
    this.name = "OdometerScanError";
    this.code = code;
    this.upstream = upstream;
  }
}

export async function scanOdometerFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  crop: CropRect,
  onProgress?: (step: ScanProgress) => void,
): Promise<OdometerScanResult> {
  onProgress?.("validating");

  const cropped = cropCanvas(sourceCanvas, crop);
  const dataUrl = canvasToJpegBase64(cropped, 0.92);

  onProgress?.("scanning");

  const res = await fetch("/api/odometer-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl, mimeType: "image/jpeg" }),
  });

  onProgress?.("processing");

  const data = (await res.json()) as {
    km?: number;
    confidence?: string;
    error?: string;
    details?: string;
  };

  if (!res.ok) {
    throw new OdometerScanError("server_error", data.error ?? null);
  }

  if (typeof data.km !== "number" || !Number.isFinite(data.km)) {
    throw new OdometerScanError("invalid_response");
  }

  return {
    km: data.km,
    confidence: parseOdometerConfidence(data.confidence),
  };
}
