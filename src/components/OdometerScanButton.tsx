"use client";

import { useRef, useState } from "react";
import { prepareOdometerScan, type OdometerScanPreview } from "@/lib/odometer-image";
import OdometerScanFlow from "@/components/OdometerScanModal";
import { Button, IconButton, Spinner } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

type OdometerScanButtonProps = {
  onDetected: (km: string) => void;
  disabled?: boolean;
  variant?: "icon" | "full";
  className?: string;
};

function CameraIcon({ className }: { className?: string }) {
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
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function GalleryIcon({ className }: { className?: string }) {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export default function OdometerScanButton({
  onDetected,
  disabled = false,
  variant = "full",
  className = "",
}: OdometerScanButtonProps) {
  const { t, formatNumber } = useTranslation();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<OdometerScanPreview | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    setLoading(true);
    try {
      const scanPreview = await prepareOdometerScan(file);
      setPreview(scanPreview);
    } catch {
      toast.error(t("odometerScanButton.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleRetake = (source: "camera" | "gallery") => {
    setPreview(null);
    requestAnimationFrame(() => {
      if (source === "camera") cameraInputRef.current?.click();
      else galleryInputRef.current?.click();
    });
  };

  const handleDetected = (km: string) => {
    onDetected(km);
    const n = parseInt(km, 10);
    if (Number.isFinite(n)) {
      toast.success(t("odometerScanButton.detected", { km: formatNumber(n) }));
    }
  };

  const isDisabled = disabled || loading;

  const fileInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );

  if (preview) {
    return (
      <div className={className}>
        {fileInputs}
        <OdometerScanFlow
          preview={preview}
          onClose={() => setPreview(null)}
          onDetected={handleDetected}
          onRetake={handleRetake}
        />
      </div>
    );
  }

  if (variant === "full") {
    return (
      <>
        {fileInputs}
        <div className={`grid grid-cols-2 gap-2 ${className}`}>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            disabled={isDisabled}
            loading={loading}
            leadingIcon={<CameraIcon className="h-5 w-5" />}
            onClick={() => cameraInputRef.current?.click()}
          >
            {t("odometerScanButton.camera")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            disabled={isDisabled}
            loading={loading}
            leadingIcon={<GalleryIcon className="h-5 w-5" />}
            onClick={() => galleryInputRef.current?.click()}
          >
            {t("odometerScanButton.gallery")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {fileInputs}
      <div className={`flex gap-1 ${className}`}>
        <IconButton
          type="button"
          label={
            loading
              ? t("odometerScanButton.loadingPhoto")
              : t("odometerScanButton.scanCameraAria")
          }
          variant="solid"
          size="lg"
          disabled={isDisabled}
          onClick={() => cameraInputRef.current?.click()}
        >
          {loading ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <CameraIcon className="h-5 w-5" />
          )}
        </IconButton>
        <IconButton
          type="button"
          label={t("odometerScanButton.scanGalleryAria")}
          variant="solid"
          size="lg"
          disabled={isDisabled}
          onClick={() => galleryInputRef.current?.click()}
        >
          <GalleryIcon className="h-5 w-5" />
        </IconButton>
      </div>
    </>
  );
}
