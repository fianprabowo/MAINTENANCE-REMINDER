import { canvasToJpegBase64 } from "./odometer-image";
import { parseNotaScanJson, type NotaScanResult } from "./nota-normalize";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
/** Soft cap — base64 + Gemini request; PDF nota biasanya jauh di bawah ini. */
const MAX_BYTES = 8 * 1024 * 1024;

export type NotaUploadPayload = {
  dataUrl: string;
  mimeType: string;
};

function isPdfFile(file: File | Blob): boolean {
  const mime = ("type" in file && file.type ? file.type : "").toLowerCase();
  if (mime === "application/pdf") return true;
  if (file instanceof File) {
    return file.name.toLowerCase().endsWith(".pdf");
  }
  return false;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Gagal membaca file"));
    };
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(blob);
  });
}

/** Load + downscale image for full-page nota OCR (no crop). */
async function loadNotaCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal memuat gambar"));
      el.src = url;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareNotaUpload(file: File | Blob): Promise<NotaUploadPayload> {
  if (file.size > MAX_BYTES) {
    throw new Error("File terlalu besar. Maksimal 8 MB.");
  }

  if (isPdfFile(file)) {
    const dataUrl = await blobToDataUrl(file);
    return { dataUrl, mimeType: "application/pdf" };
  }

  const canvas = await loadNotaCanvas(file);
  return { dataUrl: canvasToJpegBase64(canvas, JPEG_QUALITY), mimeType: "image/jpeg" };
}

/** @deprecated Use prepareNotaUpload — kept name for older imports. */
export async function prepareNotaImage(file: File | Blob): Promise<NotaUploadPayload> {
  return prepareNotaUpload(file);
}

export async function scanNotaFromFile(file: File | Blob): Promise<NotaScanResult> {
  const { dataUrl, mimeType } = await prepareNotaUpload(file);

  const res = await fetch("/api/nota-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl, mimeType }),
  });

  const data = (await res.json()) as NotaScanResult & {
    error?: string;
    details?: string;
  };

  if (!res.ok) {
    throw new Error(data.error ?? "Gagal membaca nota");
  }

  if (!Array.isArray(data.items)) {
    throw new Error("Respons nota tidak valid");
  }

  const normalized = parseNotaScanJson(JSON.stringify(data));
  if (!normalized || normalized.items.length === 0) {
    throw new Error("Tidak ada baris part yang terbaca dari nota");
  }
  return normalized;
}
