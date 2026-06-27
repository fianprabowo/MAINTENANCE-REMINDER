export type CropRect = { x: number; y: number; w: number; h: number };

/** Wide strip matching a single odometer digit row (move-only crop). */
export const ODOMETER_CROP_ASPECT = 4.8;
export const ODOMETER_CROP_WIDTH_RATIO = 0.9;

const MAX_EDGE = 1200;

export async function loadImageFile(file: File | Blob): Promise<HTMLCanvasElement> {
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

function isDisplayPixel(r: number, g: number, b: number): boolean {
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  const orangeBg = r > 100 && r > b + 15 && g > 20;
  const greenBg = g > 90 && g > r + 10;
  if (orangeBg) return lum < 100;
  if (greenBg) return lum < 95;
  return lum < 75;
}

export function detectDisplayCrop(canvas: HTMLCanvasElement): CropRect | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  const yStart = Math.floor(height * 0.1);
  const yEnd = Math.floor(height * 0.65);

  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isDisplayPixel(data[i], data[i + 1], data[i + 2])) continue;
      hits++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (hits < 60 || maxX <= minX || maxY <= minY) return null;

  const padX = Math.round((maxX - minX) * 0.04);
  const padY = Math.round((maxY - minY) * 0.1);

  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  const w = Math.min(width - x, maxX - minX + 1 + padX * 2);
  const h = Math.min(height - y, maxY - minY + 1 + padY * 2);

  return { x, y, w, h };
}

/** Fallback: horizontal band where digital odometer digits usually sit. */
export function defaultDisplayCrop(canvas: HTMLCanvasElement): CropRect {
  return createFixedOdometerCrop(canvas);
}

export function clampCropPosition(rect: CropRect, canvasW: number, canvasH: number): CropRect {
  const x = Math.max(0, Math.min(rect.x, canvasW - rect.w));
  const y = Math.max(0, Math.min(rect.y, canvasH - rect.h));
  return { x, y, w: rect.w, h: rect.h };
}

/** Fixed-size crop frame — user only repositions x/y. */
export function createFixedOdometerCrop(
  canvas: HTMLCanvasElement,
  centerX?: number,
  centerY?: number,
): CropRect {
  const { width, height } = canvas;
  const w = Math.min(Math.round(width * ODOMETER_CROP_WIDTH_RATIO), width);
  const h = Math.min(Math.round(w / ODOMETER_CROP_ASPECT), height);
  const cx = centerX ?? width / 2;
  const cy = centerY ?? height * 0.36;

  return clampCropPosition(
    { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h },
    width,
    height,
  );
}

export function cropCenter(rect: CropRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function cropCanvas(source: HTMLCanvasElement, rect: CropRect): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.w);
  canvas.height = Math.max(1, rect.h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return canvas;
}

export function canvasToJpegBase64(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL("image/jpeg", quality);
}

export type OdometerScanPreview = {
  sourceCanvas: HTMLCanvasElement;
  crop: CropRect;
};

export async function prepareOdometerScan(file: File | Blob): Promise<OdometerScanPreview> {
  const sourceCanvas = await loadImageFile(file);
  const detected = detectDisplayCrop(sourceCanvas);
  const center = detected ? cropCenter(detected) : undefined;
  const crop = createFixedOdometerCrop(
    sourceCanvas,
    center?.x,
    center?.y,
  );
  return { sourceCanvas, crop };
}
