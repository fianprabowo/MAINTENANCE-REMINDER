import { cropCanvas, canvasToJpegBase64, type CropRect } from "./odometer-image";
import type { OdometerScanResult } from "./odometer-normalize";
import { parseOdometerConfidence } from "./odometer-normalize";

export type ScanProgress = "validating" | "scanning" | "processing";

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
    throw new Error(data.error ?? "Gagal membaca odometer");
  }

  if (typeof data.km !== "number" || !Number.isFinite(data.km)) {
    throw new Error("Respons odometer tidak valid");
  }

  return {
    km: data.km,
    confidence: parseOdometerConfidence(data.confidence),
  };
}
