"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampCropPosition,
  cropCanvas,
  type CropRect,
  type OdometerScanPreview,
} from "@/lib/odometer-image";
import { scanOdometerFromCanvas, type ScanProgress } from "@/lib/odometer-scan";
import type { OdometerConfidence } from "@/lib/odometer-normalize";
import { validateOdometerImage, type ValidationResult } from "@/lib/odometer-validate";
import { toast } from "sonner";

type ViewState = { panX: number; panY: number; scale: number };

type PanDrag = { startX: number; startY: number; startPanX: number; startPanY: number };
type PinchDrag = { startDist: number; startScale: number; startPanX: number; startPanY: number };

function getImageBounds(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number,
) {
  const containerAspect = containerW / containerH;
  const imageAspect = imageW / imageH;

  if (imageAspect > containerAspect) {
    const w = containerW;
    const h = containerW / imageAspect;
    return { x: 0, y: (containerH - h) / 2, w, h };
  }

  const h = containerH;
  const w = containerH * imageAspect;
  return { x: (containerW - w) / 2, y: 0, w, h };
}

function cropFromView(
  view: ViewState,
  containerW: number,
  containerH: number,
  canvasW: number,
  canvasH: number,
  cropW: number,
  cropH: number,
): CropRect {
  const base = getImageBounds(containerW, containerH, canvasW, canvasH);
  const frameCx = containerW / 2;
  const frameCy = containerH / 2;

  const imgLeft = base.x + view.panX + (base.w * (1 - view.scale)) / 2;
  const imgTop = base.y + view.panY + (base.h * (1 - view.scale)) / 2;
  const dispW = base.w * view.scale;
  const dispH = base.h * view.scale;

  const relX = (frameCx - imgLeft) / dispW;
  const relY = (frameCy - imgTop) / dispH;

  return clampCropPosition(
    {
      x: relX * canvasW - cropW / 2,
      y: relY * canvasH - cropH / 2,
      w: cropW,
      h: cropH,
    },
    canvasW,
    canvasH,
  );
}

function viewFromCrop(
  crop: CropRect,
  containerW: number,
  containerH: number,
  canvasW: number,
  canvasH: number,
): ViewState {
  const base = getImageBounds(containerW, containerH, canvasW, canvasH);
  const frameCx = containerW / 2;
  const frameCy = containerH / 2;
  const ccx = (crop.x + crop.w / 2) / canvasW;
  const ccy = (crop.y + crop.h / 2) / canvasH;

  return {
    panX: frameCx - ccx * base.w - base.x,
    panY: frameCy - ccy * base.h - base.y,
    scale: 1,
  };
}

type Step = "crop" | "validation_failed" | "scanning" | "done";

export type OdometerScanFlowProps = {
  preview: OdometerScanPreview;
  onClose: () => void;
  onDetected: (km: string) => void;
  onRetake: (source: "camera" | "gallery") => void;
};

const SCAN_MESSAGES: Record<ScanProgress, string> = {
  validating: "Memeriksa kualitas foto…",
  scanning: "Membaca angka dengan AI…",
  processing: "Menyusun hasil…",
};

export default function OdometerScanFlow({
  preview,
  onClose,
  onDetected,
  onRetake,
}: OdometerScanFlowProps) {
  const cropSizeRef = useRef({ w: preview.crop.w, h: preview.crop.h });
  const [crop, setCrop] = useState<CropRect>(preview.crop);
  const [view, setView] = useState<ViewState>({ panX: 0, panY: 0, scale: 1 });
  const [step, setStep] = useState<Step>("crop");
  const [detectedKm, setDetectedKm] = useState("");
  const [confidence, setConfidence] = useState<OdometerConfidence>("medium");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [scanMessage, setScanMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<PanDrag | null>(null);
  const pinchRef = useRef<PinchDrag | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const viewInitRef = useRef(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const { sourceCanvas } = preview;
  const { w: cropW, h: cropH } = cropSizeRef.current;

  useEffect(() => {
    cropSizeRef.current = { w: preview.crop.w, h: preview.crop.h };
    setCrop(preview.crop);
    setStep("crop");
    setDetectedKm("");
    setConfidence("medium");
    setValidation(null);
    setScanMessage("");
    setDragging(false);
    setView({ panX: 0, panY: 0, scale: 1 });
    viewInitRef.current = false;
  }, [preview]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || step === "scanning") return;

    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview, step]);

  useEffect(() => {
    if (viewInitRef.current || step !== "crop") return;
    if (containerSize.w === 0 || containerSize.h === 0) return;

    const initialView = viewFromCrop(
      preview.crop,
      containerSize.w,
      containerSize.h,
      sourceCanvas.width,
      sourceCanvas.height,
    );
    setView(initialView);
    setCrop(
      cropFromView(
        initialView,
        containerSize.w,
        containerSize.h,
        sourceCanvas.width,
        sourceCanvas.height,
        cropW,
        cropH,
      ),
    );
    viewInitRef.current = true;
  }, [preview, step, containerSize, sourceCanvas, cropW, cropH]);

  const syncCrop = useCallback(
    (nextView: ViewState) => {
      if (containerSize.w === 0 || containerSize.h === 0) return;
      setView(nextView);
      setCrop(
        cropFromView(
          nextView,
          containerSize.w,
          containerSize.h,
          sourceCanvas.width,
          sourceCanvas.height,
          cropW,
          cropH,
        ),
      );
    },
    [containerSize, sourceCanvas, cropW, cropH],
  );

  const croppedPreviewUrl = useMemo(() => {
    return cropCanvas(sourceCanvas, crop).toDataURL("image/jpeg", 0.9);
  }, [sourceCanvas, crop]);

  const imageTransform = useMemo(() => {
    if (containerSize.w === 0) return undefined;
    const base = getImageBounds(
      containerSize.w,
      containerSize.h,
      sourceCanvas.width,
      sourceCanvas.height,
    );
    return {
      width: base.w,
      height: base.h,
      left: base.x + view.panX + (base.w * (1 - view.scale)) / 2,
      top: base.y + view.panY + (base.h * (1 - view.scale)) / 2,
      transform: `scale(${view.scale})`,
      transformOrigin: "top left",
    };
  }, [containerSize, sourceCanvas, view]);

  const pointerDistance = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.hypot(dx, dy);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (step !== "crop") return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      panRef.current = null;
      pinchRef.current = {
        startDist: pointerDistance(),
        startScale: view.scale,
        startPanX: view.panX,
        startPanY: view.panY,
      };
    } else {
      pinchRef.current = null;
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: view.panX,
        startPanY: view.panY,
      };
    }

    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (step !== "crop") return;
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const dist = pointerDistance();
      if (dist < 1) return;
      const ratio = dist / pinchRef.current.startDist;
      const nextScale = Math.min(4, Math.max(1, pinchRef.current.startScale * ratio));
      syncCrop({
        panX: pinchRef.current.startPanX,
        panY: pinchRef.current.startPanY,
        scale: nextScale,
      });
      return;
    }

    const pan = panRef.current;
    if (!pan) return;
    syncCrop({
      panX: pan.startPanX + (e.clientX - pan.startX),
      panY: pan.startPanY + (e.clientY - pan.startY),
      scale: view.scale,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.entries()][0];
      panRef.current = {
        startX: remaining[1].x,
        startY: remaining[1].y,
        startPanX: view.panX,
        startPanY: view.panY,
      };
    } else {
      panRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      setDragging(false);
      panRef.current = null;
      pinchRef.current = null;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || step !== "crop") return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      setView((prev) => {
        const nextScale = Math.min(4, Math.max(1, prev.scale * factor));
        const next = { ...prev, scale: nextScale };
        if (containerSize.w > 0) {
          setCrop(
            cropFromView(
              next,
              containerSize.w,
              containerSize.h,
              sourceCanvas.width,
              sourceCanvas.height,
              cropW,
              cropH,
            ),
          );
        }
        return next;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [step, containerSize, sourceCanvas, cropW, cropH]);

  const runScan = async () => {
    const result = validateOdometerImage(sourceCanvas, crop);
    setValidation(result);

    if (!result.ok) {
      setStep("validation_failed");
      return;
    }

    setStep("scanning");
    setScanMessage(SCAN_MESSAGES.validating);

    try {
      const scan = await scanOdometerFromCanvas(sourceCanvas, crop, (progress) => {
        setScanMessage(SCAN_MESSAGES[progress]);
      });
      const km = String(scan.km);
      setDetectedKm(km);
      setConfidence(scan.confidence);
      onDetected(km);
      setStep("done");
      if (scan.confidence === "low") {
        toast.warning("AI kurang yakin. Bandingkan foto dengan angka di field KM.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membaca odometer");
      setStep("crop");
    }
  };

  const isBusy = step === "scanning";

  return (
    <div className="relative rounded-2xl border border-(--color-border) bg-(--color-surface-alt)/40 p-4">
      {isBusy ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-(--color-bg)/95 px-4 backdrop-blur-sm">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-(--color-border) border-t-(--color-primary)" />
          <p className="mt-3 text-sm font-bold">{scanMessage}</p>
          <p className="mt-1 text-center text-xs text-(--color-text-muted)">
            Proses biasanya 3–8 detik
          </p>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">
          {step === "crop" && "Sesuaikan posisi foto"}
          {step === "validation_failed" && "Perbaiki foto"}
          {step === "done" && "Bandingkan angka"}
        </h3>
        {!isBusy && step !== "done" ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xs font-semibold text-(--color-text-muted) hover:text-(--color-text)"
          >
            Batal
          </button>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className={`relative h-56 w-full overflow-hidden rounded-xl bg-black ${
          step === "crop" ? "touch-none select-none" : "flex items-center justify-center"
        }`}
        style={step === "crop" ? { cursor: dragging ? "grabbing" : "grab" } : undefined}
        onPointerDown={step === "crop" ? handlePointerDown : undefined}
        onPointerMove={step === "crop" ? handlePointerMove : undefined}
        onPointerUp={step === "crop" ? handlePointerUp : undefined}
        onPointerCancel={step === "crop" ? handlePointerUp : undefined}
      >
        {step === "crop" && imageTransform ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceCanvas.toDataURL("image/jpeg", 0.85)}
              alt="Pratinjau foto odometer"
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: imageTransform.width,
                height: imageTransform.height,
                left: imageTransform.left,
                top: imageTransform.top,
                transform: imageTransform.transform,
                transformOrigin: "top left",
              }}
            />
            <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-3 pt-6 pb-2 text-center text-[10px] leading-snug text-white/90">
              Geser · pinch/zoom — posisikan baris angka odometer
            </p>
          </>
        ) : croppedPreviewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={croppedPreviewUrl}
            alt="Area odometer yang dibaca"
            className="max-h-full w-full object-contain p-2"
          />
        ) : null}
      </div>

      {step === "validation_failed" && validation ? (
        <ul className="mt-3 space-y-1.5">
          {validation.issues.map((issue) => (
            <li
              key={issue.id}
              className={`rounded-lg px-2.5 py-2 text-xs ${
                issue.level === "error"
                  ? "bg-red-500/10 text-red-700 dark:text-red-400"
                  : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
              }`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {step === "done" ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm text-(--color-text-secondary)">
            AI membaca:{" "}
            <span className="font-bold tabular-nums text-(--color-text)">
              {parseInt(detectedKm, 10).toLocaleString("id-ID")} km
            </span>
          </p>
          {confidence === "low" ? (
            <p className="text-xs text-red-700 dark:text-red-400">
              Hasil kurang yakin — periksa dengan teliti sebelum Simpan.
            </p>
          ) : confidence === "medium" ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Periksa angka di field KM, lalu tekan Simpan.
            </p>
          ) : (
            <p className="text-xs text-(--color-text-muted)">
              Bandingkan dengan field KM di atas, lalu tekan Simpan.
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {step === "validation_failed" ? (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  viewInitRef.current = false;
                  setStep("crop");
                }}
                className="flex-1 rounded-xl border border-(--color-border) py-2.5 text-xs font-semibold"
              >
                Geser foto
              </button>
              <button
                type="button"
                onClick={() => onRetake("camera")}
                className="flex-[1.4] rounded-xl bg-(--color-primary) py-2.5 text-xs font-bold text-white"
              >
                Foto ulang
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRetake("gallery")}
              className="rounded-xl border border-dashed border-(--color-border) py-2 text-xs font-semibold text-(--color-text-secondary)"
            >
              Pilih dari galeri
            </button>
          </>
        ) : step === "done" ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                viewInitRef.current = false;
                setStep("crop");
              }}
              className="flex-1 rounded-xl border border-(--color-border) py-2.5 text-xs font-semibold"
            >
              Scan ulang
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-[1.4] rounded-xl bg-(--color-primary) py-2.5 text-xs font-bold text-white"
            >
              Tutup
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className="flex-1 rounded-xl border border-(--color-border) py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runScan()}
              className="flex-[1.4] rounded-xl bg-(--color-primary) py-2.5 text-xs font-bold text-white disabled:opacity-60"
            >
              Baca angka
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
