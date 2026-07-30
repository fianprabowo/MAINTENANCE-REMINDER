"use client";

import { useRef, useState } from "react";
import { scanNotaFromFile } from "@/lib/nota-scan";
import type { NotaScanResult } from "@/lib/nota-normalize";
import { toast } from "sonner";

type NotaScanButtonProps = {
  /** OCR result + original file (for later upload to Supabase Storage). */
  onDetected: (result: NotaScanResult, file: File) => void;
  disabled?: boolean;
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

function FileIcon({ className }: { className?: string }) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </svg>
  );
}

export default function NotaScanButton({
  onDetected,
  disabled = false,
  className = "",
}: NotaScanButtonProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const result = await scanNotaFromFile(file);
      onDetected(result, file);
      toast.success(`${result.items.length} baris part terdeteksi dari nota`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membaca nota");
    } finally {
      setLoading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const busy = disabled || loading;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-(--color-text-muted)">
        Upload / scan nota penjualan
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={busy}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraInputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-xs font-bold text-(--color-text) shadow-sm transition-all duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          <CameraIcon className="h-4 w-4" />
          {loading ? "Memindai…" : "Kamera"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-xs font-bold text-(--color-text) shadow-sm transition-all duration-150 hover:border-(--color-primary)/40 hover:text-(--color-primary) active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          <FileIcon className="h-4 w-4" />
          {loading ? "Memindai…" : "Foto / PDF"}
        </button>
      </div>
    </div>
  );
}
