"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import {
  clampCropPosition,
  cropCanvas,
  type CropRect,
  type OdometerScanPreview,
} from "@/lib/odometer-image";
import {
  OdometerScanError,
  scanOdometerFromCanvas,
  type ScanProgress,
} from "@/lib/odometer-scan";
import type { OdometerConfidence } from "@/lib/odometer-normalize";
import { validateOdometerImage, type ValidationResult } from "@/lib/odometer-validate";
import { Button, IconButton, Spinner } from "@/components/ui";
import { toast } from "sonner";

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

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

export default function OdometerScanFlow({
  preview,
  onClose,
  onDetected,
  onRetake,
}: OdometerScanFlowProps) {
  const { t, formatNumber } = useTranslation();
  const scanMessages = useMemo<Record<ScanProgress, string>>(
    () => ({
      validating: t("odometerScanModal.validating"),
      scanning: t("odometerScanModal.scanning"),
      processing: t("odometerScanModal.processing"),
    }),
    [t],
  );
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
    setScanMessage(scanMessages.validating);

    try {
      const scan = await scanOdometerFromCanvas(sourceCanvas, crop, (progress) => {
        setScanMessage(scanMessages[progress]);
      });
      const km = String(scan.km);
      setDetectedKm(km);
      setConfidence(scan.confidence);
      onDetected(km);
      setStep("done");
      if (scan.confidence === "low") {
        toast.warning(t("odometerScanModal.lowConfidence"));
      }
    } catch (err) {
      // Translate structured `OdometerScanError` codes ke pesan locale user.
      // Sengaja tidak render `err.message` mentah karena bisa jadi debug
      // string Bahasa Indonesia dari server route (mis. GEMINI config).
      if (err instanceof OdometerScanError) {
        toast.error(t(`odometerScanError.${err.code}` as TranslationKey));
      } else {
        toast.error(t("odometerScanModal.readFailed"));
      }
      setStep("crop");
    }
  };

  const isBusy = step === "scanning";

  return (
    <div className="relative rounded-2xl border border-(--color-border) bg-(--color-surface-alt)/40 p-4">
      {isBusy ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-(--color-bg)/95 px-4 backdrop-blur-sm">
          <Spinner className="h-9 w-9 text-(--color-primary)" />
          <p className="mt-3 text-sm font-bold">{scanMessage}</p>
          <p className="mt-1 text-center text-xs text-(--color-text-muted)">
            {t("odometerScanModal.usuallySeconds")}
          </p>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">
          {step === "crop" && t("odometerScanModal.adjustPhoto")}
          {step === "validation_failed" && t("odometerScanModal.fixPhoto")}
          {step === "done" && t("odometerScanModal.compareNumbers")}
        </h3>
        {!isBusy && step !== "done" ? (
          <IconButton
            label={t("odometerScanModal.cancel")}
            size="sm"
            onClick={onClose}
            className="-mr-1"
          >
            <CloseIcon className="h-4 w-4" />
          </IconButton>
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
              alt={t("odometerScanModal.previewAlt")}
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
              {t("odometerScanModal.dragHint")}
            </p>
          </>
        ) : croppedPreviewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={croppedPreviewUrl}
            alt={t("odometerScanModal.cropAlt")}
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
                  ? "bg-(--color-text) text-(--color-bg) font-bold"
                  : "bg-(--color-surface-alt) text-(--color-text) font-semibold"
              }`}
            >
              {t(issue.messageKey)}
            </li>
          ))}
        </ul>
      ) : null}

      {step === "done" ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm text-(--color-text-secondary)">
            {t("odometerScanModal.aiRead")}{" "}
            <span className="font-bold tabular-nums text-(--color-text)">
              {formatNumber(parseInt(detectedKm, 10))} km
            </span>
          </p>
          {/*
            Confidence banner (grayscale mode) — sebelumnya red (low) / amber
            (medium) / muted (high). Sekarang encode via font-weight:
            low = bold text-color-text, medium = normal text, high = muted.
          */}
          {confidence === "low" ? (
            <p className="text-xs font-bold text-(--color-text)">
              {t("odometerScanModal.lowConfidenceCheck")}
            </p>
          ) : confidence === "medium" ? (
            <p className="text-xs text-(--color-text)">
              {t("odometerScanModal.mediumConfidenceCheck")}
            </p>
          ) : (
            <p className="text-xs text-(--color-text-muted)">
              {t("odometerScanModal.highConfidenceCheck")}
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {step === "validation_failed" ? (
          <>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-0 flex-1 rounded-xl px-3 py-2.5 text-xs"
                onClick={() => {
                  viewInitRef.current = false;
                  setStep("crop");
                }}
              >
                {t("odometerScanModal.adjustPhotoBtn")}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="min-h-0 flex-[1.4] rounded-xl px-3 py-2.5 text-xs"
                onClick={() => onRetake("camera")}
              >
                {t("odometerScanModal.retakePhoto")}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              fullWidth
              className="min-h-0 rounded-xl border-dashed py-2 text-xs text-(--color-text-secondary)"
              onClick={() => onRetake("gallery")}
            >
              {t("odometerScanModal.pickFromGallery")}
            </Button>
          </>
        ) : step === "done" ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-0 flex-1 rounded-xl px-3 py-2.5 text-xs"
              onClick={() => {
                viewInitRef.current = false;
                setStep("crop");
              }}
            >
              {t("odometerScanModal.rescan")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="min-h-0 flex-[1.4] rounded-xl px-3 py-2.5 text-xs"
              onClick={onClose}
            >
              {t("odometerScanModal.close")}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isBusy}
              className="min-h-0 flex-1 rounded-xl px-3 py-2.5 text-xs"
              onClick={onClose}
            >
              {t("odometerScanModal.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isBusy}
              className="min-h-0 flex-[1.4] rounded-xl px-3 py-2.5 text-xs"
              onClick={() => void runScan()}
            >
              {t("odometerScanModal.readDigits")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
