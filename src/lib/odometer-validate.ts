import { cropCanvas, type CropRect } from "./odometer-image";

export type ValidationIssue = {
  id: "blur" | "dark" | "bright" | "low_contrast" | "resolution" | "crop_size";
  level: "error" | "warning";
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  blurScore: number;
  brightness: number;
  contrast: number;
};

const MIN_SOURCE_EDGE = 320;
const MIN_CROP_W = 160;
const MIN_CROP_H = 28;
const BLUR_ERROR = 55;
const BLUR_WARNING = 95;
const BRIGHTNESS_DARK = 38;
const BRIGHTNESS_BRIGHT = 228;
const CONTRAST_MIN = 18;

function sampleCanvas(canvas: HTMLCanvasElement, maxEdge = 320): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas;

  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

function analyzePixels(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);

  let brightnessSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    const lum = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
    gray[i] = lum;
    brightnessSum += lum;
  }

  const brightness = brightnessSum / gray.length;

  let variance = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - brightness;
    variance += d * d;
  }
  const contrast = Math.sqrt(variance / gray.length);

  let lapSum = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        -4 * gray[i] +
        gray[i - 1] +
        gray[i + 1] +
        gray[i - width] +
        gray[i + width];
      lapSum += lap * lap;
      lapCount++;
    }
  }
  const blurScore = lapCount > 0 ? lapSum / lapCount : 0;

  return { brightness, contrast, blurScore };
}

export function validateOdometerImage(
  sourceCanvas: HTMLCanvasElement,
  crop: CropRect,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sourceEdge = Math.min(sourceCanvas.width, sourceCanvas.height);

  if (sourceEdge < MIN_SOURCE_EDGE) {
    issues.push({
      id: "resolution",
      level: "error",
      message: "Resolusi foto terlalu kecil. Dekatkan kamera ke layar odometer.",
    });
  }

  if (crop.w < MIN_CROP_W || crop.h < MIN_CROP_H) {
    issues.push({
      id: "crop_size",
      level: "error",
      message: "Area crop terlalu kecil. Geser kotak agar menutupi baris angka.",
    });
  }

  const cropped = cropCanvas(sourceCanvas, crop);
  const sample = sampleCanvas(cropped);
  const stats = analyzePixels(sample);

  if (!stats) {
    return { ok: false, issues, blurScore: 0, brightness: 0, contrast: 0 };
  }

  const { brightness, contrast, blurScore } = stats;

  if (blurScore < BLUR_ERROR) {
    issues.push({
      id: "blur",
      level: "error",
      message: "Foto terlalu blur. Pegang HP stabil dan fokuskan ke angka odometer.",
    });
  } else if (blurScore < BLUR_WARNING) {
    issues.push({
      id: "blur",
      level: "warning",
      message: "Foto sedikit blur. Hasil OCR mungkin kurang akurat.",
    });
  }

  if (brightness < BRIGHTNESS_DARK) {
    issues.push({
      id: "dark",
      level: "error",
      message: "Foto terlalu gelap. Nyalakan lampu dashboard atau flash.",
    });
  } else if (brightness > BRIGHTNESS_BRIGHT) {
    issues.push({
      id: "bright",
      level: "error",
      message: "Foto overexposed. Kurangi cahaya langsung ke layar.",
    });
  }

  if (contrast < CONTRAST_MIN) {
    issues.push({
      id: "low_contrast",
      level: "warning",
      message: "Kontras rendah. Pastikan angka terlihat jelas dari background.",
    });
  }

  const hasError = issues.some((i) => i.level === "error");
  return { ok: !hasError, issues, blurScore, brightness, contrast };
}
